import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerSyncService } from '../ledger/ledger-sync.service';
import { BadRequestException } from '@nestjs/common';
import { SplitMethod } from './dto/expense.dto';
import { Decimal } from 'decimal.js';
import { EventsGateway } from '../events/events.gateway';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prisma: PrismaService;
  let ledgerSync: LedgerSyncService;

  const mockEventsGateway = {
    emitToRoom: jest.fn(),
  };

  const mockPrismaService: any = {
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
    expense: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    expenseParticipant: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
  };

  const mockLedgerSyncService = {
    syncExpenseLedger: jest.fn(),
    deleteExpenseLedger: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LedgerSyncService, useValue: mockLedgerSyncService },
        { provide: EventsGateway, useValue: mockEventsGateway },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    prisma = module.get<PrismaService>(PrismaService);
    ledgerSync = module.get<LedgerSyncService>(LedgerSyncService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createExpense', () => {
    const activeMember = { id: 'm-1', joinedAt: new Date('2026-01-01'), leftAt: null };

    it('should throw BadRequestException if payer or participant is not active on expense date', async () => {
      // Mock membership validation: not active
      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.createExpense('group-123', 'creator-123', {
          description: 'Dinner',
          amountOriginal: 100,
          currencyCode: 'INR',
          paidBy: 'user-payer',
          expenseDate: '2026-06-13',
          splitMethod: SplitMethod.EQUAL,
          participants: [{ userId: 'user-payer' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require exchange rate for non-INR expenses', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(activeMember);

      await expect(
        service.createExpense('group-123', 'creator-123', {
          description: 'Dinner',
          amountOriginal: 100,
          currencyCode: 'USD', // Non-INR
          paidBy: 'user-payer',
          expenseDate: '2026-06-13',
          splitMethod: SplitMethod.EQUAL,
          participants: [{ userId: 'user-payer' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate Equal split rounding remainder to the last participant when sorted by userId', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(activeMember);
      mockPrismaService.expense.create.mockResolvedValue({ id: 'exp-123' });
      mockPrismaService.expenseParticipant.create.mockImplementation((args: any) => Promise.resolve(args.data));

      // ₹100 split among 3 users equally (V, U, Z)
      // Sorted: U, V, Z. Remainder should go to Z.
      const result = await service.createExpense('group-123', 'creator-123', {
        description: 'Dinner',
        amountOriginal: 100,
        currencyCode: 'INR',
        paidBy: 'user-payer',
        expenseDate: '2026-06-13',
        splitMethod: SplitMethod.EQUAL,
        participants: [
          { userId: 'user-Z' },
          { userId: 'user-U' },
          { userId: 'user-V' },
        ],
      });

      const parts = result.participants;
      expect(parts).toHaveLength(3);
      
      // Sorted by userId: 'user-U' first, 'user-V' second, 'user-Z' last
      // Expected shares: U = 33.33, V = 33.33, Z = 33.34
      const pU = parts.find((p) => p.userId === 'user-U')!;
      const pV = parts.find((p) => p.userId === 'user-V')!;
      const pZ = parts.find((p) => p.userId === 'user-Z')!;

      expect(pU.shareAmountInr.toNumber()).toBe(33.33);
      expect(pV.shareAmountInr.toNumber()).toBe(33.33);
      expect(pZ.shareAmountInr.toNumber()).toBe(33.34);
    });

    it('should validate and process Percentage splits summing strictly to 100.00%', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(activeMember);

      // Percentage sums to 99.00% -> should throw BadRequestException
      await expect(
        service.createExpense('group-123', 'creator-123', {
          description: 'Dinner',
          amountOriginal: 100,
          currencyCode: 'INR',
          paidBy: 'user-payer',
          expenseDate: '2026-06-13',
          splitMethod: SplitMethod.PERCENTAGE,
          participants: [
            { userId: 'user-A', shareUnits: 50.00 },
            { userId: 'user-B', shareUnits: 49.00 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate and process Unequal splits summing strictly to total amount', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(activeMember);

      // Unequal splits sum to 90 instead of 100 -> should throw
      await expect(
        service.createExpense('group-123', 'creator-123', {
          description: 'Dinner',
          amountOriginal: 100,
          currencyCode: 'INR',
          paidBy: 'user-payer',
          expenseDate: '2026-06-13',
          splitMethod: SplitMethod.UNEQUAL,
          participants: [
            { userId: 'user-A', shareAmount: 50.00 },
            { userId: 'user-B', shareAmount: 40.00 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
