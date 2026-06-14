import { Test, TestingModule } from '@nestjs/testing';
import { LedgerSyncService } from './ledger-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from 'decimal.js';

describe('LedgerSyncService', () => {
  let service: LedgerSyncService;
  let prisma: PrismaService;

  const mockPrismaService = {
    ledgerEntry: {
      updateMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
  };

  const mockTx = {
    ledgerEntry: {
      updateMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerSyncService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<LedgerSyncService>(LedgerSyncService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllMocks();
  });

  describe('syncExpenseLedger', () => {
    it('should soft-delete old entries and create new splits excluding the payer', async () => {
      const participants = [
        { userId: 'user-payer', shareAmountInr: new Decimal(33.33) },
        { userId: 'user-2', shareAmountInr: new Decimal(33.33) },
        { userId: 'user-3', shareAmountInr: new Decimal(33.34) },
      ];

      mockTx.ledgerEntry.updateMany.mockResolvedValue({});
      mockTx.ledgerEntry.createMany.mockResolvedValue({});

      await service.syncExpenseLedger(
        mockTx,
        'expense-id-123',
        'group-id-123',
        'Dinner',
        'user-payer',
        new Date(),
        'creator-123',
        participants,
      );

      // Verify soft delete of old entries
      expect(mockTx.ledgerEntry.updateMany).toHaveBeenCalledWith({
        where: { expenseId: 'expense-id-123', isDeleted: false },
        data: { isDeleted: true },
      });

      // Verify creation of new entries (excluding payer)
      expect(mockTx.ledgerEntry.createMany).toHaveBeenCalledWith({
        data: [
          {
            groupId: 'group-id-123',
            entryType: 'expense_split',
            debtorId: 'user-2',
            creditorId: 'user-payer',
            amountInr: new Decimal(33.33),
            entryDate: expect.any(Date),
            note: 'Dinner',
            expenseId: 'expense-id-123',
            createdBy: 'creator-123',
          },
          {
            groupId: 'group-id-123',
            entryType: 'expense_split',
            debtorId: 'user-3',
            creditorId: 'user-payer',
            amountInr: new Decimal(33.34),
            entryDate: expect.any(Date),
            note: 'Dinner',
            expenseId: 'expense-id-123',
            createdBy: 'creator-123',
          },
        ],
      });
    });
  });

  describe('syncSettlementLedger', () => {
    it('should soft-delete old entries and create reversing settlement entry', async () => {
      mockTx.ledgerEntry.updateMany.mockResolvedValue({});
      mockTx.ledgerEntry.create.mockResolvedValue({});

      await service.syncSettlementLedger(
        mockTx,
        'settlement-id-123',
        'group-id-123',
        'user-from', // payer
        'user-to',   // recipient
        new Decimal(100.0),
        new Date(),
        'creator-123',
        'Settling dinner',
      );

      // Verify soft delete
      expect(mockTx.ledgerEntry.updateMany).toHaveBeenCalledWith({
        where: { settlementId: 'settlement-id-123', isDeleted: false },
        data: { isDeleted: true },
      });

      // Verify reversing entry: V pays U means debtor = U, creditor = V
      expect(mockTx.ledgerEntry.create).toHaveBeenCalledWith({
        data: {
          groupId: 'group-id-123',
          entryType: 'settlement',
          debtorId: 'user-to',
          creditorId: 'user-from',
          amountInr: new Decimal(100.0),
          entryDate: expect.any(Date),
          note: 'Settling dinner',
          settlementId: 'settlement-id-123',
          createdBy: 'creator-123',
        },
      });
    });
  });

  describe('deleteExpenseLedger', () => {
    it('should soft-delete active entries linked to this expense', async () => {
      mockTx.ledgerEntry.updateMany.mockResolvedValue({});

      await service.deleteExpenseLedger(mockTx, 'expense-id-123');

      expect(mockTx.ledgerEntry.updateMany).toHaveBeenCalledWith({
        where: { expenseId: 'expense-id-123', isDeleted: false },
        data: { isDeleted: true },
      });
    });
  });
});
