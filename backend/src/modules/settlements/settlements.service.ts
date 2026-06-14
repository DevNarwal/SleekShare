import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerSyncService } from '../ledger/ledger-sync.service';
import { CreateSettlementDto, UpdateSettlementDto } from './dto/settlement.dto';
import { Decimal } from 'decimal.js';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerSync: LedgerSyncService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // Helper: validate timeline membership
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
        `The ${roleName} (User ID: ${userId}) was not an active member of the group on the settlement date (${dateStr})`
      );
    }
  }

  // Create settlement
  async createSettlement(groupId: string, creatorId: string, dto: CreateSettlementDto) {
    if (dto.fromUserId === dto.toUserId) {
      throw new BadRequestException('Payer and receiver cannot be the same user');
    }
    if (dto.amountInr <= 0) {
      throw new BadRequestException('Settlement amount must be greater than 0');
    }

    const settlementDate = new Date(dto.settlementDate);

    // Timeline validations
    await this.validateTimeline(groupId, dto.fromUserId, settlementDate, 'sender');
    await this.validateTimeline(groupId, dto.toUserId, settlementDate, 'receiver');

    const amountInr = new Decimal(dto.amountInr).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const result = await this.prisma.$transaction(async (tx) => {
      const settlement = await tx.settlement.create({
        data: {
          groupId,
          fromUserId: dto.fromUserId,
          toUserId: dto.toUserId,
          amountInr,
          settlementDate,
          note: dto.note,
          createdBy: creatorId,
        },
      });

      // Sync to ledger (V pays U: U is debtor, V is creditor in reversing entry)
      await this.ledgerSync.syncSettlementLedger(
        tx,
        settlement.id,
        groupId,
        dto.fromUserId,
        dto.toUserId,
        amountInr,
        settlementDate,
        creatorId,
        dto.note,
      );

      return settlement;
    });

    this.eventsGateway.emitToRoom(`group:${groupId}`, 'settlement.created', { groupId, settlement: result });
    this.eventsGateway.emitToRoom(`group:${groupId}`, 'balance.updated', { groupId });

    return result;
  }

  // Get settlements for a group
  async getSettlements(groupId: string) {
    return this.prisma.settlement.findMany({
      where: { groupId, isDeleted: false },
      include: {
        fromUser: {
          select: { id: true, displayName: true, avatarInitials: true, avatarColor: true },
        },
        toUser: {
          select: { id: true, displayName: true, avatarInitials: true, avatarColor: true },
        },
      },
      orderBy: { settlementDate: 'desc' },
    });
  }

  // Get single settlement by ID
  async getSettlementById(id: string) {
    const settlement = await this.prisma.settlement.findFirst({
      where: { id, isDeleted: false },
      include: {
        fromUser: {
          select: { id: true, displayName: true, email: true },
        },
        toUser: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    return settlement;
  }

  // Update settlement
  async updateSettlement(id: string, editorId: string, dto: UpdateSettlementDto) {
    const existing = await this.getSettlementById(id);

    const fromUserId = dto.fromUserId || existing.fromUserId;
    const toUserId = dto.toUserId || existing.toUserId;

    if (fromUserId === toUserId) {
      throw new BadRequestException('Payer and receiver cannot be the same user');
    }

    const amount = dto.amountInr || Number(existing.amountInr);
    if (amount <= 0) {
      throw new BadRequestException('Settlement amount must be greater than 0');
    }

    const settlementDate = dto.settlementDate ? new Date(dto.settlementDate) : existing.settlementDate;

    // Timeline validations
    await this.validateTimeline(existing.groupId, fromUserId, settlementDate, 'sender');
    await this.validateTimeline(existing.groupId, toUserId, settlementDate, 'receiver');

    const amountInr = new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({
        where: { id },
        data: {
          fromUserId,
          toUserId,
          amountInr,
          settlementDate,
          note: dto.note !== undefined ? dto.note : existing.note,
        },
      });

      // Sync ledger entries (Soft-delete old and write new)
      await this.ledgerSync.syncSettlementLedger(
        tx,
        id,
        existing.groupId,
        fromUserId,
        toUserId,
        amountInr,
        settlementDate,
        editorId,
        (dto.note !== undefined ? dto.note : existing.note) ?? undefined,
      );

      return updated;
    });

    this.eventsGateway.emitToRoom(`group:${existing.groupId}`, 'balance.updated', { groupId: existing.groupId });

    return result;
  }

  // Soft-delete settlement
  async deleteSettlement(id: string) {
    const existing = await this.getSettlementById(id);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({
        where: { id },
        data: { isDeleted: true },
      });

      // Soft-delete ledger entries
      await this.ledgerSync.deleteSettlementLedger(tx, id);
      return updated;
    });

    this.eventsGateway.emitToRoom(`group:${existing.groupId}`, 'balance.updated', { groupId: existing.groupId });

    return result;
  }
}
