import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerSyncService } from '../ledger/ledger-sync.service';
import { Decimal } from 'decimal.js';

@Injectable()
export class BalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerSync: LedgerSyncService,
  ) {}

  // Calculate raw balances for a group (from LedgerEntries only)
  async calculateRawBalances(groupId: string) {
    const now = new Date();

    // 1. Fetch group to verify it exists
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
                avatarInitials: true,
                avatarColor: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // 2. Fetch all active ledger entries for this group
    const ledgerEntries = await this.prisma.ledgerEntry.findMany({
      where: { groupId, isDeleted: false },
    });

    // 3. Compute credits and debits per user
    const membersSummary = group.memberships.map((m) => {
      const u = m.user;
      
      // Credits: Sum of amountInr where creditorId === user
      const credits = ledgerEntries
        .filter((entry) => entry.creditorId === u.id)
        .reduce((sum, entry) => sum.add(new Decimal(entry.amountInr.toString())), new Decimal(0));

      // Debits: Sum of amountInr where debtorId === user
      const debits = ledgerEntries
        .filter((entry) => entry.debtorId === u.id)
        .reduce((sum, entry) => sum.add(new Decimal(entry.amountInr.toString())), new Decimal(0));

      const netBalance = credits.sub(debits).toDecimalPlaces(2);

      // Total Paid: Sum of amountInr where creditorId === user AND entryType === 'expense_split'
      const totalPaid = ledgerEntries
        .filter((entry) => entry.creditorId === u.id && entry.entryType === 'expense_split')
        .reduce((sum, entry) => sum.add(new Decimal(entry.amountInr.toString())), new Decimal(0));

      // Total Owed: Sum of amountInr where debtorId === user AND entryType === 'expense_split'
      const totalOwed = ledgerEntries
        .filter((entry) => entry.debtorId === u.id && entry.entryType === 'expense_split')
        .reduce((sum, entry) => sum.add(new Decimal(entry.amountInr.toString())), new Decimal(0));

      return {
        user: u,
        netBalance: netBalance.toNumber(),
        totalPaid: totalPaid.toDecimalPlaces(2).toNumber(),
        totalOwed: totalOwed.toDecimalPlaces(2).toNumber(),
      };
    });

    return {
      members: membersSummary,
    };
  }

  // Get lightweight balance summary for dashboard
  async getBalancesSummary(groupId: string) {
    const raw = await this.calculateRawBalances(groupId);
    return {
      currency: 'INR',
      members: raw.members.map((m) => ({
        userId: m.user.id,
        balance: m.netBalance,
      })),
    };
  }

  // Min-Cash-Flow Simplification Algorithm
  async simplifyDebts(groupId: string) {
    const raw = await this.calculateRawBalances(groupId);
    const EPSILON = 0.01;

    // Filter and map into creditors and debtors
    const creditors = raw.members
      .filter((m) => m.netBalance > EPSILON)
      .map((m) => ({ userId: m.user.id, balance: new Decimal(m.netBalance) }))
      .sort((a, b) => b.balance.sub(a.balance).toNumber()); // Descending

    const debtors = raw.members
      .filter((m) => m.netBalance < -EPSILON)
      .map((m) => ({ userId: m.user.id, balance: new Decimal(m.netBalance) }))
      .sort((a, b) => a.balance.sub(b.balance).toNumber()); // Ascending (Most negative first)

    const transfers = [];

    while (creditors.length > 0 && debtors.length > 0) {
      const c = creditors[0];
      const d = debtors[0];

      // Payment is the minimum of creditor's credit and debtor's debt
      const payment = Decimal.min(c.balance, d.balance.abs());

      transfers.push({
        from: d.userId,
        to: c.userId,
        amount: payment.toDecimalPlaces(2).toNumber(),
      });

      c.balance = c.balance.sub(payment);
      d.balance = d.balance.add(payment);

      if (c.balance.lt(EPSILON)) {
        creditors.shift();
      } else {
        creditors.sort((x, y) => y.balance.sub(x.balance).toNumber());
      }

      if (d.balance.abs().lt(EPSILON)) {
        debtors.shift();
      } else {
        debtors.sort((x, y) => x.balance.sub(y.balance).toNumber());
      }
    }

    return {
      transfers,
    };
  }

  // Explain balances line-by-line between a pair of users
  async explainBalance(groupId: string, userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot explain balance with oneself');
    }

    // Fetch all active ledger entries between the pair
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        groupId,
        isDeleted: false,
        OR: [
          { debtorId: userId, creditorId: targetUserId },
          { debtorId: targetUserId, creditorId: userId },
        ],
      },
      orderBy: { entryDate: 'asc' },
    });

    const lines = entries.map((entry) => {
      const isDebtor = entry.debtorId === userId;
      // Debtor is positive (User owes Target), Creditor is negative (Target owes User)
      const amount = isDebtor 
        ? new Decimal(entry.amountInr.toString()) 
        : new Decimal(entry.amountInr.toString()).negated();

      return {
        type: entry.entryType === 'expense_split' ? 'expense' : 'settlement',
        expenseId: entry.expenseId || undefined,
        settlementId: entry.settlementId || undefined,
        description: entry.note || '',
        date: entry.entryDate.toISOString().split('T')[0],
        amount: amount.toDecimalPlaces(2).toNumber(),
      };
    });

    const netAmount = lines.reduce((sum, line) => sum.add(line.amount), new Decimal(0)).toDecimalPlaces(2).toNumber();

    return {
      userId,
      targetUserId,
      netAmount,
      lines,
    };
  }

  // Rebuild all ledger entries in a group
  async rebuildLedger(groupId: string) {
    await this.ledgerSync.rebuildGroupLedger(groupId);
    return {
      message: 'Ledger rebuilt successfully',
    };
  }
}
