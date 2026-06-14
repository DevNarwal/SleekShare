import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerSyncService } from '../ledger/ledger-sync.service';
import { CreateExpenseDto, UpdateExpenseDto, SplitMethod } from './dto/expense.dto';
import { Decimal } from 'decimal.js';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerSync: LedgerSyncService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // Helper: check if a user is an active member of a group on a specific date
  private async validateTimeline(groupId: string, userId: string, date: Date, roleName: string) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const membership = await this.prisma.membership.findFirst({
      where: {
        groupId,
        userId,
        joinedAt: { lte: startOfDay },
        OR: [
          { leftAt: null },
          { leftAt: { gte: startOfDay } },
        ],
      },
    });

    if (!membership) {
      const dateStr = startOfDay.toISOString().split('T')[0];
      throw new BadRequestException(
        `The ${roleName} (User ID: ${userId}) was not an active member of the group on the expense date (${dateStr})`
      );
    }
  }

  // Create an expense
  async createExpense(groupId: string, creatorId: string, dto: CreateExpenseDto) {
    const expenseDateObj = new Date(dto.expenseDate);

    // 1. Validate timeline eligibility for the payer
    await this.validateTimeline(groupId, dto.paidBy, expenseDateObj, 'payer');

    // 2. Validate timeline eligibility for all participants
    if (dto.participants.length === 0) {
      throw new BadRequestException('At least one participant is required');
    }
    for (const p of dto.participants) {
      await this.validateTimeline(groupId, p.userId, expenseDateObj, 'participant');
    }

    // 3. Validate exchange rates
    let exchangeRate = new Decimal(1.0);
    if (dto.currencyCode.toUpperCase() === 'INR') {
      exchangeRate = new Decimal(1.0);
    } else {
      if (!dto.exchangeRate) {
        throw new BadRequestException('Exchange rate is required for non-INR expenses');
      }
      if (dto.exchangeRate <= 0) {
        throw new BadRequestException('Exchange rate must be greater than 0');
      }
      exchangeRate = new Decimal(dto.exchangeRate);
    }

    const amountOriginal = new Decimal(dto.amountOriginal);
    const amountBaseInr = amountOriginal.mul(exchangeRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // 4. Calculate splits
    const calculatedParticipants = this.calculateSplits(
      dto.splitMethod,
      amountOriginal,
      amountBaseInr,
      exchangeRate,
      dto.participants,
    );

    // 5. Generate flags
    const flags: string[] = [];
    if (dto.currencyCode.toUpperCase() !== 'INR') {
      flags.push('foreign_currency');
    }

    // 6. DB Transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          groupId,
          description: dto.description,
          amountOriginal,
          currencyCode: dto.currencyCode.toUpperCase(),
          exchangeRate,
          amountBaseInr,
          paidBy: dto.paidBy,
          expenseDate: expenseDateObj,
          splitMethod: dto.splitMethod,
          category: dto.category,
          notes: dto.notes,
          flags,
          createdBy: creatorId,
        },
      });

      // Create participants
      const createdParticipants = [];
      for (const p of calculatedParticipants) {
        const cp = await tx.expenseParticipant.create({
          data: {
            expenseId: expense.id,
            userId: p.userId,
            shareAmountInr: p.shareAmountInr,
            shareUnits: p.shareUnits,
          },
        });
        createdParticipants.push(cp);
      }

      // Sync ledger entries (Soft-delete old and write new)
      await this.ledgerSync.syncExpenseLedger(
        tx,
        expense.id,
        groupId,
        dto.description,
        dto.paidBy,
        expenseDateObj,
        creatorId,
        calculatedParticipants,
      );

      const res = {
        ...expense,
        participants: createdParticipants,
      };
      return res;
    });

    this.eventsGateway.emitToRoom(`group:${groupId}`, 'expense.created', { groupId, expense: result });
    this.eventsGateway.emitToRoom(`group:${groupId}`, 'balance.updated', { groupId });

    return result;
  }

  // Retrieve expenses with filters and paging
  async getExpenses(
    groupId: string,
    filters: {
      page?: number;
      limit?: number;
      search?: string;
      member?: string;
      category?: string;
      flags?: string[];
      month?: string;
    },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      groupId,
      isDeleted: false,
    };

    const conditions: any[] = [];

    if (filters.search) {
      conditions.push({
        description: {
          contains: filters.search,
          mode: 'insensitive',
        },
      });
    }

    if (filters.member) {
      conditions.push({
        OR: [
          { paidBy: filters.member },
          { participants: { some: { userId: filters.member } } },
        ],
      });
    }

    if (filters.category) {
      if (filters.category.toLowerCase() === 'general') {
        conditions.push({
          OR: [
            { category: { equals: 'General', mode: 'insensitive' } },
            { category: null },
          ],
        });
      } else {
        conditions.push({
          category: {
            equals: filters.category,
            mode: 'insensitive',
          },
        });
      }
    }

    if (filters.flags && filters.flags.length > 0) {
      conditions.push({
        flags: {
          hasEvery: filters.flags,
        },
      });
    }

    if (filters.month) {
      // filters.month is expected in format 'YYYY-MM'
      const [year, month] = filters.month.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      conditions.push({
        expenseDate: {
          gte: start,
          lt: end,
        },
      });
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  avatarInitials: true,
                  avatarColor: true,
                },
              },
            },
          },
          payer: {
            select: {
              id: true,
              displayName: true,
              avatarInitials: true,
              avatarColor: true,
            },
          },
        },
        orderBy: { expenseDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data,
      total,
      page,
    };
  }

  // Get single expense details
  async getExpenseById(id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, isDeleted: false },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
              },
            },
          },
        },
        payer: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return expense;
  }

  // Update an expense
  async updateExpense(id: string, editorId: string, dto: UpdateExpenseDto) {
    const existing = await this.getExpenseById(id);

    const expenseDateObj = dto.expenseDate ? new Date(dto.expenseDate) : existing.expenseDate;
    const paidBy = dto.paidBy || existing.paidBy;

    // 1. Validate timeline eligibility for the payer
    await this.validateTimeline(existing.groupId, paidBy, expenseDateObj, 'payer');

    // 2. Resolve participants
    let finalParticipants = [];
    if (dto.participants) {
      if (dto.participants.length === 0) {
        throw new BadRequestException('At least one participant is required');
      }
      for (const p of dto.participants) {
        await this.validateTimeline(existing.groupId, p.userId, expenseDateObj, 'participant');
      }
      finalParticipants = dto.participants;
    } else {
      // Load current participants
      const current = await this.prisma.expenseParticipant.findMany({ where: { expenseId: id } });
      for (const p of current) {
        await this.validateTimeline(existing.groupId, p.userId, expenseDateObj, 'participant');
      }
      finalParticipants = current.map((p) => ({
        userId: p.userId,
        shareAmount: undefined, // Will be computed or kept based on splitMethod
        shareUnits: p.shareUnits ? Number(p.shareUnits) : undefined,
      }));
    }

    // 3. Resolve FX rates
    const currencyCode = dto.currencyCode || existing.currencyCode;
    let exchangeRate = new Decimal(1.0);
    if (currencyCode.toUpperCase() === 'INR') {
      exchangeRate = new Decimal(1.0);
    } else {
      const rate = dto.exchangeRate || Number(existing.exchangeRate);
      if (!rate) {
        throw new BadRequestException('Exchange rate is required for non-INR expenses');
      }
      if (rate <= 0) {
        throw new BadRequestException('Exchange rate must be greater than 0');
      }
      exchangeRate = new Decimal(rate);
    }

    const amountOriginal = new Decimal(dto.amountOriginal || Number(existing.amountOriginal));
    const amountBaseInr = amountOriginal.mul(exchangeRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const splitMethod = dto.splitMethod || (existing.splitMethod as SplitMethod);

    // 4. Recalculate splits
    const calculatedParticipants = this.calculateSplits(
      splitMethod,
      amountOriginal,
      amountBaseInr,
      exchangeRate,
      finalParticipants,
    );

    // 5. DB Transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Soft-delete old participants
      await tx.expenseParticipant.deleteMany({ where: { expenseId: id } });

      // Create new participants
      const createdParticipants = [];
      for (const p of calculatedParticipants) {
        const cp = await tx.expenseParticipant.create({
          data: {
            expenseId: id,
            userId: p.userId,
            shareAmountInr: p.shareAmountInr,
            shareUnits: p.shareUnits,
          },
        });
        createdParticipants.push(cp);
      }

      // Update expense
      const flags = [...existing.flags];
      if (currencyCode.toUpperCase() !== 'INR' && !flags.includes('foreign_currency')) {
        flags.push('foreign_currency');
      } else if (currencyCode.toUpperCase() === 'INR' && flags.includes('foreign_currency')) {
        const index = flags.indexOf('foreign_currency');
        flags.splice(index, 1);
      }

      const updatedExpense = await tx.expense.update({
        where: { id },
        data: {
          description: dto.description || existing.description,
          amountOriginal,
          currencyCode: currencyCode.toUpperCase(),
          exchangeRate,
          amountBaseInr,
          paidBy,
          expenseDate: expenseDateObj,
          splitMethod,
          category: dto.category !== undefined ? dto.category : existing.category,
          notes: dto.notes !== undefined ? dto.notes : existing.notes,
          flags,
        },
      });

      // Sync ledger entries (Soft-delete old and write new)
      await this.ledgerSync.syncExpenseLedger(
        tx,
        id,
        existing.groupId,
        dto.description || existing.description,
        paidBy,
        expenseDateObj,
        editorId,
        calculatedParticipants,
      );

      const res = {
        ...updatedExpense,
        participants: createdParticipants,
      };
      return res;
    });

    this.eventsGateway.emitToRoom(`group:${existing.groupId}`, 'expense.updated', { groupId: existing.groupId, expense: result });
    this.eventsGateway.emitToRoom(`group:${existing.groupId}`, 'balance.updated', { groupId: existing.groupId });

    return result;
  }

  // Soft-delete an expense
  async deleteExpense(id: string) {
    const existing = await this.getExpenseById(id);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: { isDeleted: true },
      });

      // Soft-delete ledger entries
      await this.ledgerSync.deleteExpenseLedger(tx, id);
      return updated;
    });

    this.eventsGateway.emitToRoom(`group:${existing.groupId}`, 'expense.deleted', { groupId: existing.groupId, expenseId: id });
    this.eventsGateway.emitToRoom(`group:${existing.groupId}`, 'balance.updated', { groupId: existing.groupId });

    return result;
  }

  // Main split calculation router
  private calculateSplits(
    method: SplitMethod,
    amountOriginal: Decimal,
    amountBaseInr: Decimal,
    exchangeRate: Decimal,
    participants: { userId: string; shareAmount?: number; shareUnits?: number }[],
  ) {
    const count = participants.length;
    // Deterministic sorting by userId ascending
    const sorted = [...participants].sort((a, b) => a.userId.localeCompare(b.userId));

    if (method === SplitMethod.EQUAL) {
      if (count === 0) {
        throw new BadRequestException('At least one participant is required for equal split');
      }
      
      const standardShareOriginal = amountOriginal.div(count).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const remainderOriginal = amountOriginal.sub(standardShareOriginal.mul(count));
      
      const standardShareInr = amountBaseInr.div(count).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const remainderInr = amountBaseInr.sub(standardShareInr.mul(count));

      return sorted.map((p, index) => {
        const isLast = index === count - 1;
        const shareAmountInr = isLast ? standardShareInr.add(remainderInr) : standardShareInr;
        return {
          userId: p.userId,
          shareAmountInr,
          shareUnits: null,
        };
      });
    }

    if (method === SplitMethod.UNEQUAL) {
      let sumOriginal = new Decimal(0);
      for (const p of sorted) {
        if (p.shareAmount === undefined) {
          throw new BadRequestException(`Unequal split requires shareAmount for user ${p.userId}`);
        }
        if (p.shareAmount < 0) {
          throw new BadRequestException('Share amount cannot be negative');
        }
        sumOriginal = sumOriginal.add(p.shareAmount);
      }

      // Check sum equals total original amount (allowing 0.01 threshold)
      if (!sumOriginal.sub(amountOriginal).abs().lte(0.01)) {
        throw new BadRequestException(
          `Sum of unequal shares (${sumOriginal}) must equal total expense amount (${amountOriginal})`
        );
      }

      let sumInr = new Decimal(0);
      const preAdjusted = sorted.map((p) => {
        const originalShare = new Decimal(p.shareAmount!);
        const inrShare = originalShare.mul(exchangeRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        sumInr = sumInr.add(inrShare);
        return {
          userId: p.userId,
          shareAmountInr: inrShare,
          shareUnits: null,
        };
      });

      const remainderInr = amountBaseInr.sub(sumInr);
      if (!remainderInr.isZero() && count > 0) {
        preAdjusted[count - 1].shareAmountInr = preAdjusted[count - 1].shareAmountInr.add(remainderInr);
      }

      return preAdjusted;
    }

    if (method === SplitMethod.PERCENTAGE) {
      let sumPct = new Decimal(0);
      for (const p of sorted) {
        if (p.shareUnits === undefined) {
          throw new BadRequestException(`Percentage split requires shareUnits percentage for user ${p.userId}`);
        }
        if (p.shareUnits < 0) {
          throw new BadRequestException('Percentage cannot be negative');
        }
        sumPct = sumPct.add(p.shareUnits);
      }

      // Strict check: must equal 100.00%
      if (!sumPct.equals(100.00)) {
        throw new BadRequestException(`Sum of percentages must equal 100.00% (got ${sumPct}%)`);
      }

      let sumInr = new Decimal(0);
      const preAdjusted = sorted.map((p) => {
        const pct = new Decimal(p.shareUnits!);
        const shareAmountInr = amountBaseInr.mul(pct).div(100).toDecimalPlaces(2, Decimal.ROUND_DOWN);
        sumInr = sumInr.add(shareAmountInr);
        return {
          userId: p.userId,
          shareAmountInr,
          shareUnits: pct,
        };
      });

      const remainderInr = amountBaseInr.sub(sumInr);
      if (!remainderInr.isZero() && count > 0) {
        preAdjusted[count - 1].shareAmountInr = preAdjusted[count - 1].shareAmountInr.add(remainderInr);
      }

      return preAdjusted;
    }

    if (method === SplitMethod.SHARE) {
      let totalShares = new Decimal(0);
      for (const p of sorted) {
        if (p.shareUnits === undefined) {
          throw new BadRequestException(`Share split requires shareUnits ratio for user ${p.userId}`);
        }
        if (p.shareUnits < 0) {
          throw new BadRequestException('Share units ratio cannot be negative');
        }
        totalShares = totalShares.add(p.shareUnits);
      }

      if (totalShares.isZero() || totalShares.isNegative()) {
        throw new BadRequestException('Total share ratio units must be greater than 0');
      }

      let sumInr = new Decimal(0);
      const preAdjusted = sorted.map((p) => {
        const ratio = new Decimal(p.shareUnits!);
        const shareAmountInr = amountBaseInr.mul(ratio).div(totalShares).toDecimalPlaces(2, Decimal.ROUND_DOWN);
        sumInr = sumInr.add(shareAmountInr);
        return {
          userId: p.userId,
          shareAmountInr,
          shareUnits: ratio,
        };
      });

      const remainderInr = amountBaseInr.sub(sumInr);
      if (!remainderInr.isZero() && count > 0) {
        preAdjusted[count - 1].shareAmountInr = preAdjusted[count - 1].shareAmountInr.add(remainderInr);
      }

      return preAdjusted;
    }

    throw new BadRequestException('Unsupported split method');
  }
}
