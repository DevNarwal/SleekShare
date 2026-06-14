import { Test, TestingModule } from '@nestjs/testing';
import { BalancesService } from './balances.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerSyncService } from '../ledger/ledger-sync.service';
import { Decimal } from 'decimal.js';

describe('BalancesService', () => {
  let service: BalancesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    group: {
      findUnique: jest.fn(),
    },
    ledgerEntry: {
      findMany: jest.fn(),
    },
  };

  const mockLedgerSyncService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalancesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LedgerSyncService, useValue: mockLedgerSyncService },
      ],
    }).compile();

    service = module.get<BalancesService>(BalancesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateRawBalances', () => {
    it('should calculate Credits - Debits for all active group members', async () => {
      const mockGroup = {
        id: 'group-123',
        memberships: [
          { user: { id: 'user-A', displayName: 'User A' } },
          { user: { id: 'user-B', displayName: 'User B' } },
          { user: { id: 'user-C', displayName: 'User C' } },
        ],
      };

      const mockLedgerEntries = [
        // A paid 300, split among A, B, C (100 each).
        // Ledger: B owes A 100, C owes A 100.
        { debtorId: 'user-B', creditorId: 'user-A', amountInr: new Decimal(100.0), entryType: 'expense_split' },
        { debtorId: 'user-C', creditorId: 'user-A', amountInr: new Decimal(100.0), entryType: 'expense_split' },
        // B paid a settlement to A of 50.
        // Ledger: debtor = A, creditor = B, amount = 50.
        { debtorId: 'user-A', creditorId: 'user-B', amountInr: new Decimal(50.0), entryType: 'settlement' },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue(mockGroup);
      mockPrismaService.ledgerEntry.findMany.mockResolvedValue(mockLedgerEntries);

      const result = await service.calculateRawBalances('group-123');

      expect(prisma.group.findUnique).toHaveBeenCalled();
      expect(prisma.ledgerEntry.findMany).toHaveBeenCalled();

      // Expectations:
      // user-A:
      // Credits (creditor) = 100 (from B) + 100 (from C) = 200
      // Debits (debtor) = 50 (settlement from B) = 50
      // Net = 200 - 50 = +150
      // totalPaid (expense credits) = 200
      // totalOwed (expense debits) = 0
      const balanceA = result.members.find((m) => m.user.id === 'user-A');
      expect(balanceA).toBeDefined();
      expect(balanceA!.netBalance).toBe(150.0);
      expect(balanceA!.totalPaid).toBe(200.0);
      expect(balanceA!.totalOwed).toBe(0.0);

      // user-B:
      // Credits (creditor) = 50 (settlement to A) = 50
      // Debits (debtor) = 100 (expense share to A) = 100
      // Net = 50 - 100 = -50
      // totalPaid = 0
      // totalOwed = 100
      const balanceB = result.members.find((m) => m.user.id === 'user-B');
      expect(balanceB).toBeDefined();
      expect(balanceB!.netBalance).toBe(-50.0);
      expect(balanceB!.totalPaid).toBe(0.0);
      expect(balanceB!.totalOwed).toBe(100.0);

      // user-C:
      // Credits = 0
      // Debits = 100
      // Net = -100
      const balanceC = result.members.find((m) => m.user.id === 'user-C');
      expect(balanceC).toBeDefined();
      expect(balanceC!.netBalance).toBe(-100.0);
    });
  });

  describe('simplifyDebts', () => {
    it('should compute minimum cash transfers with creditor/debtor sorting and Epsilon checks', async () => {
      // Mock raw balances output
      // A: +150
      // B: -50
      // C: -100
      // Expected transfers:
      // B pays A 50
      // C pays A 100
      const mockGroup = {
        id: 'group-123',
        memberships: [
          { user: { id: 'user-A' } },
          { user: { id: 'user-B' } },
          { user: { id: 'user-C' } },
        ],
      };
      const mockLedgerEntries = [
        { debtorId: 'user-B', creditorId: 'user-A', amountInr: new Decimal(50.0), entryType: 'expense_split' },
        { debtorId: 'user-C', creditorId: 'user-A', amountInr: new Decimal(100.0), entryType: 'expense_split' },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue(mockGroup);
      mockPrismaService.ledgerEntry.findMany.mockResolvedValue(mockLedgerEntries);

      const result = await service.simplifyDebts('group-123');
      expect(result.transfers).toHaveLength(2);

      const transferB = result.transfers.find((t) => t.from === 'user-B');
      const transferC = result.transfers.find((t) => t.from === 'user-C');

      expect(transferB).toBeDefined();
      expect(transferC).toBeDefined();

      expect(transferB!.to).toBe('user-A');
      expect(transferB!.amount).toBe(50.0);

      expect(transferC!.to).toBe('user-A');
      expect(transferC!.amount).toBe(100.0);
    });
  });

  describe('explainBalance', () => {
    it('should return detailed ledger breakdown lines with correct signs from user perspective', async () => {
      const mockLedgerEntries = [
        {
          id: 'entry-1',
          entryType: 'expense_split',
          debtorId: 'user-B', // user-B owes user-A
          creditorId: 'user-A',
          amountInr: new Decimal(100.0),
          entryDate: new Date('2026-06-13'),
          note: 'Dinner',
          expenseId: 'exp-123',
        },
        {
          id: 'entry-2',
          entryType: 'settlement',
          debtorId: 'user-A', // B paid A 50
          creditorId: 'user-B',
          amountInr: new Decimal(50.0),
          entryDate: new Date('2026-06-14'),
          note: 'Repayment',
          settlementId: 'set-123',
        },
      ];

      mockPrismaService.ledgerEntry.findMany.mockResolvedValue(mockLedgerEntries);

      // Explain from B's perspective (userId = user-B, target = user-A)
      // Line 1: B is debtor -> positive (+100.00)
      // Line 2: B is creditor -> negative (-50.00)
      // Net = +50.00
      const result = await service.explainBalance('group-123', 'user-B', 'user-A');

      expect(result.netAmount).toBe(50.0);
      expect(result.lines).toHaveLength(2);

      const l1 = result.lines[0];
      const l2 = result.lines[1];

      expect(l1.type).toBe('expense');
      expect(l1.amount).toBe(100.0);

      expect(l2.type).toBe('settlement');
      expect(l2.amount).toBe(-50.0);
    });
  });
});
