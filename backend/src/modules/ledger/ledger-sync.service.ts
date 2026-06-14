import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LedgerSyncService {
  constructor(private readonly prisma: PrismaService) {}

  // Sync expense splits to ledger (soft-deletes old entries, inserts new entries)
  async syncExpenseLedger(
    tx: Prisma.TransactionClient,
    expenseId: string,
    groupId: string,
    description: string,
    paidBy: string,
    expenseDate: Date,
    createdBy: string,
    participants: { userId: string; shareAmountInr: Prisma.Decimal }[],
  ) {
    // 1. Soft-delete old ledger entries for this expense
    await tx.ledgerEntry.updateMany({
      where: { expenseId, isDeleted: false },
      data: { isDeleted: true },
    });

    // 2. Create new ledger entries for each participant (except if they are the payer)
    const ledgerData = participants
      .filter((p) => p.userId !== paidBy)
      .map((p) => ({
        groupId,
        entryType: 'expense_split',
        debtorId: p.userId, // Debtor owes payer
        creditorId: paidBy,  // Creditor is paid by payer
        amountInr: p.shareAmountInr,
        entryDate: expenseDate,
        note: description,
        expenseId,
        createdBy,
      }));

    if (ledgerData.length > 0) {
      await tx.ledgerEntry.createMany({
        data: ledgerData,
      });
    }
  }

  // Soft-delete expense splits on deletion
  async deleteExpenseLedger(tx: Prisma.TransactionClient, expenseId: string) {
    await tx.ledgerEntry.updateMany({
      where: { expenseId, isDeleted: false },
      data: { isDeleted: true },
    });
  }

  // Sync settlement to ledger (soft-deletes old entries, inserts new entries)
  async syncSettlementLedger(
    tx: Prisma.TransactionClient,
    settlementId: string,
    groupId: string,
    fromUserId: string,
    toUserId: string,
    amountInr: Prisma.Decimal,
    settlementDate: Date,
    createdBy: string,
    note?: string,
  ) {
    // 1. Soft-delete old ledger entries for this settlement
    await tx.ledgerEntry.updateMany({
      where: { settlementId, isDeleted: false },
      data: { isDeleted: true },
    });

    // 2. Create new reversing ledger entry
    // V pays U: V is creditor (offsets V's debits), U is debtor (offsets U's credits)
    await tx.ledgerEntry.create({
      data: {
        groupId,
        entryType: 'settlement',
        debtorId: toUserId,    // recipient offsets credits
        creditorId: fromUserId, // payer offsets debits
        amountInr,
        entryDate: settlementDate,
        note: note || 'Settlement',
        settlementId,
        createdBy,
      },
    });
  }

  // Soft-delete settlement ledger on deletion
  async deleteSettlementLedger(tx: Prisma.TransactionClient, settlementId: string) {
    await tx.ledgerEntry.updateMany({
      where: { settlementId, isDeleted: false },
      data: { isDeleted: true },
    });
  }

  // Rebuild group-wide ledger (from expenses and settlements)
  async rebuildGroupLedger(groupId: string) {
    await this.prisma.$transaction(async (tx) => {
      // 1. Soft-delete all active ledger entries for this group
      await tx.ledgerEntry.updateMany({
        where: { groupId, isDeleted: false },
        data: { isDeleted: true },
      });

      // 2. Fetch all non-deleted expenses with their participants
      const expenses = await tx.expense.findMany({
        where: { groupId, isDeleted: false },
        include: { participants: true },
      });

      for (const exp of expenses) {
        const ledgerData = exp.participants
          .filter((p) => p.userId !== exp.paidBy)
          .map((p) => ({
            groupId,
            entryType: 'expense_split',
            debtorId: p.userId,
            creditorId: exp.paidBy,
            amountInr: p.shareAmountInr,
            entryDate: exp.expenseDate,
            note: exp.description,
            expenseId: exp.id,
            createdBy: exp.createdBy,
          }));

        if (ledgerData.length > 0) {
          await tx.ledgerEntry.createMany({
            data: ledgerData,
          });
        }
      }

      // 3. Fetch all non-deleted settlements
      const settlements = await tx.settlement.findMany({
        where: { groupId, isDeleted: false },
      });

      for (const set of settlements) {
        await tx.ledgerEntry.create({
          data: {
            groupId,
            entryType: 'settlement',
            debtorId: set.toUserId,
            creditorId: set.fromUserId,
            amountInr: set.amountInr,
            entryDate: set.settlementDate,
            note: set.note || 'Settlement',
            settlementId: set.id,
            createdBy: set.createdBy,
          },
        });
      }
    });
  }
}
