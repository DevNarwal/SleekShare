import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerSyncService } from '../ledger/ledger-sync.service';
import { EventsGateway } from '../events/events.gateway';
import { CsvParser, NormalizedRow, NormalizedParticipant } from './pipeline/csv-parser';
import { AnomalyDetector } from './pipeline/anomaly-detector';
import { AnomalyContext, parseLocalDate, formatDateString } from './pipeline/anomaly-handlers';
import { ApproveRowDto, ResolutionAction } from './dto/import.dto';
import * as crypto from 'crypto';
import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerSync: LedgerSyncService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // Hash helper
  private computeHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Resolve user identity case-insensitively
  private resolveUser(nameOrEmail: string, groupId: string, allUsers: any[]): any {
    const clean = nameOrEmail.trim().toLowerCase();
    if (clean.includes('@')) {
      return allUsers.find((u) => u.email.toLowerCase() === clean);
    }
    
    // Search in group members first
    const groupMember = allUsers.find(
      (u) =>
        u.displayName.toLowerCase() === clean &&
        u.memberships.some((m: any) => m.groupId === groupId)
    );
    if (groupMember) return groupMember;

    // Search globally
    return allUsers.find((u) => u.displayName.toLowerCase() === clean);
  }

  // Parse, detect anomalies, and store ImportJob
  async uploadCsv(groupId: string, uploaderId: string, file: Express.Multer.File) {
    const fileHash = this.computeHash(file.buffer);

    // 1. Check duplicate hash in group
    const existingJob = await this.prisma.importJob.findFirst({
      where: { groupId, fileHash, status: { not: 'failed' } },
    });
    if (existingJob) {
      throw new ConflictException({
        status: 'already_uploaded',
        existingJobId: existingJob.id,
      });
    }

    // 2. Parse CSV
    const csvContent = file.buffer.toString('utf-8');
    let parsedRows: NormalizedRow[] = [];
    try {
      parsedRows = CsvParser.parse(csvContent);
    } catch (err: any) {
      throw new BadRequestException(`Malformed CSV: ${err.message}`);
    }

    // 3. Resolve context for anomaly detection
    const allUsers = await this.prisma.user.findMany({
      include: { memberships: true },
    });

    const resolvedUsersMap = new Map<string, any>();
    for (const row of parsedRows) {
      if (row.paidBy) {
        const payer = this.resolveUser(row.paidBy, groupId, allUsers);
        if (payer) resolvedUsersMap.set(row.paidBy.toLowerCase(), payer);
      }
      for (const p of row.participants) {
        const resolved = this.resolveUser(p.nameOrEmail, groupId, allUsers);
        if (resolved) resolvedUsersMap.set(p.nameOrEmail.toLowerCase(), resolved);
      }
    }

    const existingExpenses = await this.prisma.expense.findMany({
      where: { groupId, isDeleted: false },
      select: { description: true, expenseDate: true, amountBaseInr: true },
    });

    const existingSettlements = await this.prisma.settlement.findMany({
      where: { groupId, isDeleted: false },
      select: { fromUserId: true, toUserId: true, amountInr: true, settlementDate: true },
    });

    const currencies = (await this.prisma.currency.findMany()).map((c) => c.code.toUpperCase());
    const exchangeRates = await this.prisma.exchangeRate.findMany();

    const anomalyContext: AnomalyContext = {
      groupId,
      existingExpenses: existingExpenses.map((e) => ({
        description: e.description,
        expenseDate: e.expenseDate,
        amountBaseInr: Number(e.amountBaseInr),
      })),
      existingSettlements: existingSettlements.map((s) => ({
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amountInr: Number(s.amountInr),
        settlementDate: s.settlementDate,
      })),
      currencies,
      exchangeRates: exchangeRates.map((r) => ({
        fromCode: r.fromCode,
        rateDate: r.rateDate,
        rate: Number(r.rate),
      })),
      resolvedUsers: resolvedUsersMap,
      today: new Date(),
    };

    const anomalyDetector = new AnomalyDetector();

    // 4. Run anomaly detection and format row database entries
    let cleanCount = 0;
    let anomalyCount = 0;

    const dbRowsData = parsedRows.map((row) => {
      const anomalies = anomalyDetector.detect(row, anomalyContext);
      const isClean = anomalies.length === 0;
      if (isClean) cleanCount++;
      else anomalyCount++;

      // Build parsedData structure
      const payerUser = resolvedUsersMap.get(row.paidBy?.toLowerCase());
      const participantsData = row.participants.map((p) => {
        const resolved = resolvedUsersMap.get(p.nameOrEmail.toLowerCase());
        return {
          nameOrEmail: p.nameOrEmail,
          userId: resolved ? resolved.id : null,
          value: p.value,
        };
      });

      const parsedData = {
        date: row.date,
        description: row.description,
        amount: row.amount,
        currency: row.currency,
        paidByUserId: payerUser ? payerUser.id : null,
        splitMethod: row.splitMethod,
        participants: participantsData,
      };

      return {
        rowNumber: row.rowNumber,
        rawData: row.rawData as any,
        parsedData: parsedData as any,
        status: 'pending',
        anomalies: {
          create: anomalies.map((a) => ({
            anomalyType: a.anomalyType,
            severity: a.severity,
            detail: a.detail,
            suggestedFix: a.suggestedFix,
          })),
        },
      };
    });

    // 5. Database transaction to persist job
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.importJob.create({
        data: {
          groupId,
          uploadedBy: uploaderId,
          filename: file.originalname,
          fileHash,
          totalRows: parsedRows.length,
          cleanRows: cleanCount,
          anomalyRows: anomalyCount,
          status: anomalyCount > 0 ? 'reviewing' : 'pending',
        },
      });

      for (const r of dbRowsData) {
        await tx.importRow.create({
          data: {
            jobId: job.id,
            rowNumber: r.rowNumber,
            rawData: r.rawData,
            parsedData: r.parsedData,
            status: r.status,
            anomalies: r.anomalies,
          },
        });
      }

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          groupId,
          actorId: uploaderId,
          eventType: 'IMPORT_JOB_CREATED',
          entityType: 'ImportJob',
          entityId: job.id,
          metadata: {
            filename: file.originalname,
            totalRows: parsedRows.length,
            cleanRows: cleanCount,
            anomalyRows: anomalyCount,
          },
        },
      });

      this.eventsGateway.emitToRoom(`group:${groupId}`, 'import.job.created', {
        groupId,
        jobId: job.id,
        filename: file.originalname,
        totalRows: parsedRows.length,
      });

      return job;
    });
  }

  // Get historical jobs for group
  async getImportJobs(groupId: string) {
    const jobs = await this.prisma.importJob.findMany({
      where: { groupId },
      include: {
        uploader: { select: { id: true, displayName: true } },
        importRows: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((job) => {
      const rows = job.importRows;
      const total = rows.length;
      const clean = rows.filter((r) => r.status === 'pending').length; // simple approximation
      const approved = rows.filter((r) => r.status === 'approved').length;
      const imported = rows.filter((r) => r.status === 'imported').length;
      const rejected = rows.filter((r) => r.status === 'rejected').length;

      return {
        id: job.id,
        filename: job.filename,
        fileHash: job.fileHash,
        status: job.status,
        createdAt: job.createdAt,
        uploader: job.uploader,
        summary: {
          total,
          clean,
          approved,
          imported,
          rejected,
        },
      };
    });
  }

  // Get single job details with summary counts
  async getImportJob(groupId: string, jobId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, groupId },
      include: {
        uploader: { select: { id: true, displayName: true } },
        importRows: {
          include: { anomalies: true },
          orderBy: { rowNumber: 'asc' },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    const rows = job.importRows;
    const totalRows = rows.length;
    const clean = rows.filter((r) => r.status === 'pending' && r.anomalies.length === 0).length;
    const warnings = rows.filter((r) => r.status === 'pending' && r.anomalies.some((a) => a.severity === 'warning')).length;
    const errors = rows.filter((r) => r.status === 'pending' && r.anomalies.some((a) => a.severity === 'error')).length;
    const approved = rows.filter((r) => r.status === 'approved').length;
    const imported = rows.filter((r) => r.status === 'imported').length;
    const rejected = rows.filter((r) => r.status === 'rejected').length;

    return {
      id: job.id,
      filename: job.filename,
      fileHash: job.fileHash,
      status: job.status,
      createdAt: job.createdAt,
      uploader: job.uploader,
      summary: {
        totalRows,
        clean,
        warnings,
        errors,
        approved,
        imported,
        rejected,
      },
      rows,
    };
  }

  // Approve a single row (resolving warning/anomalies)
  async approveRow(groupId: string, jobId: string, rowId: string, userId: string, dto: ApproveRowDto) {
    const row = await this.prisma.importRow.findFirst({
      where: { id: rowId, jobId, job: { groupId } },
      include: { anomalies: true },
    });

    if (!row) {
      throw new NotFoundException('Import row not found');
    }

    if (row.status === 'imported') {
      throw new BadRequestException('Row is already imported');
    }

    // If there are severe errors, reject approving unless they are warnings
    const hasErrors = row.anomalies.some((a) => a.severity === 'error' && !a.resolution);
    if (hasErrors) {
      throw new BadRequestException('Cannot approve row containing unresolved severe errors');
    }

    return this.prisma.$transaction(async (tx) => {
      const parsed = row.parsedData as any;
      const expenseDate = parseLocalDate(parsed.date);
      if (!expenseDate) {
        throw new BadRequestException('Invalid date in parsed row');
      }

      let rowStatus = 'approved';

      // Apply resolutions
      if (dto.resolutions && dto.resolutions.length > 0) {
        for (const res of dto.resolutions) {
          const anomaly = row.anomalies.find((a) => a.id === res.anomalyId);
          if (!anomaly) continue;

          if (res.action === ResolutionAction.CREATE_IMPORT_MEMBERSHIP) {
            // Find which user triggered the timeline anomaly
            // Extract the user identity from details or parsed data
            let targetUserId: string | null = null;
            if (anomaly.anomalyType === 'INACTIVE_MEMBER' || anomaly.anomalyType === 'PARTICIPANT_MISMATCH' || anomaly.anomalyType === 'PRE_MEMBERSHIP_DATE') {
              // Try matching parsed users
              if (parsed.paidByUserId) {
                targetUserId = parsed.paidByUserId;
              }
              // Wait, if it is a participant, find participant matching anomaly detail
              for (const p of parsed.participants) {
                if (p.userId && anomaly.detail.toLowerCase().includes(p.nameOrEmail.toLowerCase())) {
                  targetUserId = p.userId;
                  break;
                }
              }
            }

            if (!targetUserId) {
              throw new BadRequestException(`Could not resolve user for CREATE_IMPORT_MEMBERSHIP on anomaly ${anomaly.id}`);
            }

            // Find if there's any future membership for this user in group
            const nextMembership = await tx.membership.findFirst({
              where: { groupId, userId: targetUserId, joinedAt: { gt: expenseDate } },
              orderBy: { joinedAt: 'asc' },
            });

            const leftAt = nextMembership ? new Date(nextMembership.joinedAt.getTime() - 1000) : null;

            // Create explicit import-resolution membership window
            await tx.membership.create({
              data: {
                groupId,
                userId: targetUserId,
                joinedAt: expenseDate,
                leftAt,
                source: 'IMPORT_RESOLUTION',
              },
            });

            // Log Audit event
            await tx.auditLog.create({
              data: {
                groupId,
                actorId: userId,
                eventType: 'IMPORT_MEMBERSHIP_RESOLUTION_APPLIED',
                entityType: 'User',
                entityId: targetUserId,
                metadata: {
                  joinedAt: expenseDate,
                  leftAt,
                  jobId,
                  rowId,
                },
              },
            });
          } else if (res.action === ResolutionAction.IGNORE_PARTICIPANT) {
            // Find which participant nameOrEmail matches the anomaly detail
            let ignoredParticipantIndex = -1;
            for (let i = 0; i < parsed.participants.length; i++) {
              const p = parsed.participants[i];
              if (anomaly.detail.toLowerCase().includes(p.nameOrEmail.toLowerCase())) {
                ignoredParticipantIndex = i;
                break;
              }
            }

            if (ignoredParticipantIndex !== -1) {
              // Remove participant
              parsed.participants.splice(ignoredParticipantIndex, 1);
            }
          } else if (res.action === ResolutionAction.MAP_MEMBER) {
            if (!res.mappedUserId) {
              throw new BadRequestException('mappedUserId is required for MAP_MEMBER resolution');
            }
            if (anomaly.detail.toLowerCase().includes('payer') || anomaly.detail.toLowerCase().includes(parsed.paidBy?.toLowerCase() || '')) {
              parsed.paidByUserId = res.mappedUserId;
            } else {
              for (const p of parsed.participants) {
                if (anomaly.detail.toLowerCase().includes(p.nameOrEmail.toLowerCase())) {
                  p.userId = res.mappedUserId;
                  break;
                }
              }
            }
          } else if (res.action === ResolutionAction.ENTER_EXCHANGE_RATE) {
            if (!res.rate || isNaN(res.rate) || res.rate <= 0) {
              throw new BadRequestException('A valid exchange rate is required for ENTER_EXCHANGE_RATE resolution');
            }
            parsed.exchangeRate = res.rate;
          } else if (res.action === ResolutionAction.REMAP_SPLIT_METHOD || res.action === ResolutionAction.AUTO_ADJUST_SPLIT) {
            parsed.splitMethod = 'equal';
          } else if (res.action === ResolutionAction.REJECT_AND_CREATE_SETTLEMENT) {
            rowStatus = 'rejected';
            if (!res.fromUserId || !res.toUserId || !res.amountInr || !res.date) {
              throw new BadRequestException('Missing payload for REJECT_AND_CREATE_SETTLEMENT resolution');
            }
            await tx.settlement.create({
              data: {
                groupId,
                fromUserId: res.fromUserId,
                toUserId: res.toUserId,
                amountInr: new Decimal(res.amountInr),
                settlementDate: new Date(res.date),
                createdBy: userId,
              },
            });
          }

          // Mark anomaly as resolved in database
          await tx.importAnomaly.update({
            where: { id: anomaly.id },
            data: {
              resolution: 'approved',
              resolvedBy: userId,
              resolvedAt: new Date(),
            },
          });
        }
      }

      // Recalculate or save parsedData modifications
      const updatedRow = await tx.importRow.update({
        where: { id: rowId },
        data: {
          status: rowStatus,
          parsedData: parsed,
        },
        include: { anomalies: true },
      });

      this.eventsGateway.emitToRoom(`group:${groupId}`, 'import.row.approved', { groupId, jobId, rowId });

      await tx.auditLog.create({
        data: {
          groupId,
          actorId: userId,
          eventType: 'IMPORT_ROW_APPROVED',
          entityType: 'ImportRow',
          entityId: rowId,
          metadata: { jobId },
        },
      });

      return updatedRow;
    });
  }

  // Reject a single row
  async rejectRow(groupId: string, jobId: string, rowId: string, userId: string, reason?: string) {
    const row = await this.prisma.importRow.findFirst({
      where: { id: rowId, jobId, job: { groupId } },
      include: { anomalies: true },
    });

    if (!row) {
      throw new NotFoundException('Import row not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Mark anomalies as rejected
      for (const a of row.anomalies) {
        await tx.importAnomaly.update({
          where: { id: a.id },
          data: {
            resolution: 'rejected',
            resolvedBy: userId,
            resolvedAt: new Date(),
          },
        });
      }

      const updatedRow = await tx.importRow.update({
        where: { id: rowId },
        data: { status: 'rejected' },
      });

      this.eventsGateway.emitToRoom(`group:${groupId}`, 'import.row.rejected', { groupId, jobId, rowId });

      await tx.auditLog.create({
        data: {
          groupId,
          actorId: userId,
          eventType: 'IMPORT_ROW_REJECTED',
          entityType: 'ImportRow',
          entityId: rowId,
          metadata: { jobId, reason },
        },
      });

      return updatedRow;
    });
  }

  // Recalculate currency and split outputs without modifying DB
  private async buildExpenseDraft(row: any, groupId: string) {
    const parsed = row.parsedData as any;

    const expenseDate = parseLocalDate(parsed.date);
    if (!expenseDate) throw new BadRequestException('Invalid expense date');

    const paidBy = parsed.paidByUserId;
    if (!paidBy) throw new BadRequestException('Unresolved payer ID');

    // 1. Resolve FX rate
    let exchangeRate = new Decimal(1.0);
    const currencyCode = parsed.currency.toUpperCase();
    if (currencyCode !== 'INR') {
      if (parsed.exchangeRate && !isNaN(Number(parsed.exchangeRate))) {
        exchangeRate = new Decimal(Number(parsed.exchangeRate));
      } else {
        const match = await this.prisma.exchangeRate.findFirst({
          where: { fromCode: currencyCode, toCode: 'INR', rateDate: expenseDate },
        });
        if (!match) {
          throw new BadRequestException(`No exchange rate found for ${currencyCode} on ${parsed.date}`);
        }
        exchangeRate = new Decimal(Number(match.rate));
      }
    }

    const amountOriginal = new Decimal(parsed.amount);
    const amountBaseInr = amountOriginal.mul(exchangeRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // 2. Perform splits
    const participants = parsed.participants as { userId: string; value?: number }[];
    if (participants.length === 0) {
      throw new BadRequestException('No participants found in parsed row');
    }

    const count = participants.length;
    const sorted = [...participants].sort((a, b) => a.userId.localeCompare(b.userId));
    const splitMethod = parsed.splitMethod.toLowerCase();

    let calculated: { userId: string; shareAmountInr: Decimal; shareUnits: Decimal | null }[] = [];

    if (splitMethod === 'equal') {
      const shareOriginal = amountOriginal.div(count).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const shareInr = amountBaseInr.div(count).toDecimalPlaces(2, Decimal.ROUND_DOWN);

      const remainderInr = amountBaseInr.sub(shareInr.mul(count));

      calculated = sorted.map((p, idx) => {
        const isLast = idx === count - 1;
        return {
          userId: p.userId,
          shareAmountInr: isLast ? shareInr.add(remainderInr) : shareInr,
          shareUnits: null,
        };
      });
    } else if (splitMethod === 'unequal') {
      let sumInr = new Decimal(0);
      calculated = sorted.map((p) => {
        if (p.value === undefined) {
          throw new BadRequestException(`Unequal split requires amount for participant ${p.userId}`);
        }
        const origShare = new Decimal(p.value);
        const inrShare = origShare.mul(exchangeRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        sumInr = sumInr.add(inrShare);
        return {
          userId: p.userId,
          shareAmountInr: inrShare,
          shareUnits: null,
        };
      });

      const remainderInr = amountBaseInr.sub(sumInr);
      if (!remainderInr.isZero() && count > 0) {
        calculated[count - 1].shareAmountInr = calculated[count - 1].shareAmountInr.add(remainderInr);
      }
    } else if (splitMethod === 'percentage') {
      let sumInr = new Decimal(0);
      calculated = sorted.map((p) => {
        if (p.value === undefined) {
          throw new BadRequestException(`Percentage split requires percentage for participant ${p.userId}`);
        }
        const pct = new Decimal(p.value);
        const inrShare = amountBaseInr.mul(pct).div(100).toDecimalPlaces(2, Decimal.ROUND_DOWN);
        sumInr = sumInr.add(inrShare);
        return {
          userId: p.userId,
          shareAmountInr: inrShare,
          shareUnits: pct,
        };
      });

      const remainderInr = amountBaseInr.sub(sumInr);
      if (!remainderInr.isZero() && count > 0) {
        calculated[count - 1].shareAmountInr = calculated[count - 1].shareAmountInr.add(remainderInr);
      }
    } else if (splitMethod === 'share') {
      let totalShares = new Decimal(0);
      for (const p of sorted) {
        if (p.value === undefined) {
          throw new BadRequestException(`Share split requires units for participant ${p.userId}`);
        }
        totalShares = totalShares.add(p.value);
      }

      if (totalShares.isZero() || totalShares.isNegative()) {
        throw new BadRequestException('Total share units ratio must be greater than 0');
      }

      let sumInr = new Decimal(0);
      calculated = sorted.map((p) => {
        const ratio = new Decimal(p.value!);
        const inrShare = amountBaseInr.mul(ratio).div(totalShares).toDecimalPlaces(2, Decimal.ROUND_DOWN);
        sumInr = sumInr.add(inrShare);
        return {
          userId: p.userId,
          shareAmountInr: inrShare,
          shareUnits: ratio,
        };
      });

      const remainderInr = amountBaseInr.sub(sumInr);
      if (!remainderInr.isZero() && count > 0) {
        calculated[count - 1].shareAmountInr = calculated[count - 1].shareAmountInr.add(remainderInr);
      }
    } else {
      throw new BadRequestException(`Unsupported split method: ${splitMethod}`);
    }

    return {
      description: parsed.description,
      amountOriginal,
      currencyCode,
      exchangeRate,
      amountBaseInr,
      paidBy,
      expenseDate,
      splitMethod: splitMethod === 'share' ? 'SHARE' : splitMethod.toUpperCase(),
      participants: calculated,
    };
  }

  // Idempotent transactional application of a single row to ledger/expenses
  async importRow(tx: Prisma.TransactionClient, rowId: string, groupId: string, creatorId: string) {
    // 1. Lock/Fetch row and verify idempotency
    const row = await tx.importRow.findUnique({
      where: { id: rowId },
      include: { anomalies: true },
    });

    if (!row) {
      throw new NotFoundException('Import row not found');
    }

    // Check if already imported (strict unique constraint also handles concurrent race conditions)
    if (row.status === 'imported' || row.createdExpenseId) {
      return null;
    }

    // 2. Draft mapping
    const draft = await this.buildExpenseDraft(row, groupId);

    // 3. Create expense record
    const expense = await tx.expense.create({
      data: {
        groupId,
        description: draft.description,
        amountOriginal: draft.amountOriginal,
        currencyCode: draft.currencyCode,
        exchangeRate: draft.exchangeRate,
        amountBaseInr: draft.amountBaseInr,
        paidBy: draft.paidBy,
        expenseDate: draft.expenseDate,
        splitMethod: draft.splitMethod,
        createdBy: creatorId,
        flags: ['imported'],
      },
    });

    // Create participants
    for (const p of draft.participants) {
      await tx.expenseParticipant.create({
        data: {
          expenseId: expense.id,
          userId: p.userId,
          shareAmountInr: p.shareAmountInr,
          shareUnits: p.shareUnits,
        },
      });
    }

    // 4. Sync ledger entries
    await this.ledgerSync.syncExpenseLedger(
      tx,
      expense.id,
      groupId,
      draft.description,
      draft.paidBy,
      draft.expenseDate,
      creatorId,
      draft.participants,
    );

    // 5. Update status
    await tx.importRow.update({
      where: { id: rowId },
      data: {
        status: 'imported',
        createdExpenseId: expense.id,
      },
    });

    // 6. Log Audit Event
    await tx.auditLog.create({
      data: {
        groupId,
        actorId: creatorId,
        eventType: 'IMPORT_ROW_IMPORTED',
        entityType: 'Expense',
        entityId: expense.id,
        metadata: { jobId: row.jobId, rowId },
      },
    });

    this.eventsGateway.emitToRoom(`group:${groupId}`, 'import.row.imported', { groupId, jobId: row.jobId, rowId, expenseId: expense.id });

    return expense;
  }

  // Bulk import clean & approved rows
  async importReadyRows(groupId: string, jobId: string, userId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, groupId },
      include: {
        importRows: {
          include: { anomalies: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    // Filter approved or clean pending (pending with 0 anomalies)
    const readyRows = job.importRows.filter(
      (r) => r.status === 'approved' || (r.status === 'pending' && r.anomalies.length === 0)
    );

    let importedCount = 0;

    // Process rows sequentially inside a single transaction to maintain order and schema lock safety
    await this.prisma.$transaction(async (tx) => {
      for (const row of readyRows) {
        try {
          const res = await this.importRow(tx, row.id, groupId, userId);
          if (res) importedCount++;
        } catch (err) {
          console.error(`Failed to import row ${row.rowNumber}:`, err);
          throw new BadRequestException(`Failed to import row ${row.rowNumber}: ${err.message}`);
        }
      }

      // Check if job is completed (i.e. all rows are imported or rejected)
      const allRows = await tx.importRow.findMany({ where: { jobId } });
      const completed = allRows.every((r) => r.status === 'imported' || r.status === 'rejected');

      if (completed) {
        await tx.importJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            completedAt: new Date(),
            importedRows: { increment: importedCount },
          },
        });
      } else {
        await tx.importJob.update({
          where: { id: jobId },
          data: {
            importedRows: { increment: importedCount },
          },
        });
      }
    });

    return importedCount;
  }

  // Approve and import all clean/warning-only rows
  async approveAll(groupId: string, jobId: string, userId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, groupId },
      include: {
        importRows: {
          include: { anomalies: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    // Approve warning/clean pending rows (errors must be resolved or ignored explicitly)
    const warningOrCleanRows = job.importRows.filter((r) => {
      if (r.status !== 'pending') return false;
      const hasErrors = r.anomalies.some((a) => a.severity === 'error');
      return !hasErrors;
    });

    await this.prisma.$transaction(async (tx) => {
      for (const row of warningOrCleanRows) {
        const parsed = row.parsedData as any;
        const expenseDate = parseLocalDate(parsed.date);
        let rowStatus = 'approved';

        for (const a of row.anomalies) {
          if (a.resolution) continue; // Skip already resolved

          if (a.anomalyType === 'PRE_MEMBERSHIP_DATE' || a.anomalyType === 'INACTIVE_MEMBER') {
            // Default: CREATE_IMPORT_MEMBERSHIP
            let targetUserId: string | null = null;
            if (parsed.paidByUserId) {
              targetUserId = parsed.paidByUserId;
            }
            for (const p of parsed.participants) {
              if (p.userId && a.detail.toLowerCase().includes(p.nameOrEmail.toLowerCase())) {
                targetUserId = p.userId;
                break;
              }
            }

            if (targetUserId && expenseDate) {
              const nextMembership = await tx.membership.findFirst({
                where: { groupId, userId: targetUserId, joinedAt: { gt: expenseDate } },
                orderBy: { joinedAt: 'asc' },
              });
              const leftAt = nextMembership ? new Date(nextMembership.joinedAt.getTime() - 1000) : null;

              await tx.membership.create({
                data: {
                  groupId,
                  userId: targetUserId,
                  joinedAt: expenseDate,
                  leftAt,
                  source: 'IMPORT_RESOLUTION',
                },
              });
            }
          } else if (a.anomalyType === 'FUTURE_DATE' || a.anomalyType === 'FOREIGN_CURRENCY') {
            // Approve
          } else if (a.anomalyType === 'DUPLICATE_EXPENSE' || a.anomalyType === 'DUPLICATE_SETTLEMENT') {
            // Reject Row
            rowStatus = 'rejected';
          } else if (a.anomalyType === 'SETTLEMENT_AS_EXPENSE') {
            // Keep for manual review, do not default
            continue;
          } else if (a.anomalyType === 'PARTICIPANT_MISMATCH') {
            // Default: Ignore participant
            let ignoredParticipantIndex = -1;
            for (let i = 0; i < parsed.participants.length; i++) {
              const p = parsed.participants[i];
              if (a.detail.toLowerCase().includes(p.nameOrEmail.toLowerCase())) {
                ignoredParticipantIndex = i;
                break;
              }
            }
            if (ignoredParticipantIndex !== -1) {
              parsed.participants.splice(ignoredParticipantIndex, 1);
            }
          }

          // Mark anomaly resolved
          await tx.importAnomaly.update({
            where: { id: a.id },
            data: {
              resolution: 'approved',
              resolvedBy: userId,
              resolvedAt: new Date(),
            },
          });
        }

        await tx.importRow.update({
          where: { id: row.id },
          data: {
            status: rowStatus,
            parsedData: parsed,
          },
        });

        this.eventsGateway.emitToRoom(`group:${groupId}`, 'import.row.approved', { groupId, jobId, rowId: row.id });
      }
    });

    // Run importReadyRows to process all approved
    let importedCount = 0;
    try {
      importedCount = await this.importReadyRows(groupId, jobId, userId);
    } catch (err: any) {
      this.eventsGateway.emitToRoom(`group:${groupId}`, 'import.job.failed', { groupId, jobId, error: err.message });
      throw err;
    }

    // Fetch updated counts for socket payload
    const updatedJob = await this.prisma.importJob.findUnique({ where: { id: jobId } });

    this.eventsGateway.emitToRoom(`group:${groupId}`, 'import.progress.updated', {
      groupId,
      jobId,
      importedCount: updatedJob?.importedRows ?? 0,
    });

    this.eventsGateway.emitToRoom(`group:${groupId}`, 'import.job.completed', {
      groupId,
      jobId,
      status: updatedJob?.status ?? 'completed',
    });

    // Log Audit Event
    await this.prisma.auditLog.create({
      data: {
        groupId,
        actorId: userId,
        eventType: 'IMPORT_COMPLETED',
        entityType: 'ImportJob',
        entityId: jobId,
        metadata: { importedCount },
      },
    });

    return importedCount;
  }

  // Reject all rows containing errors
  async rejectAllErrors(groupId: string, jobId: string, userId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, groupId },
      include: {
        importRows: {
          include: { anomalies: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    const errorRows = job.importRows.filter(
      (r) => r.status === 'pending' && r.anomalies.some((a) => a.severity === 'error')
    );

    await this.prisma.$transaction(async (tx) => {
      for (const row of errorRows) {
        for (const a of row.anomalies) {
          await tx.importAnomaly.update({
            where: { id: a.id },
            data: {
              resolution: 'rejected',
              resolvedBy: userId,
              resolvedAt: new Date(),
            },
          });
        }

        await tx.importRow.update({
          where: { id: row.id },
          data: { status: 'rejected' },
        });

        this.eventsGateway.emitToRoom(`group:${groupId}`, 'import.row.rejected', { groupId, jobId, rowId: row.id });
      }
    });

    return errorRows.length;
  }
}

