import { Test, TestingModule } from '@nestjs/testing';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerSyncService } from '../ledger/ledger-sync.service';
import { EventsGateway } from '../events/events.gateway';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';

describe('ImportService', () => {
  let service: ImportService;
  let prisma: PrismaService;

  const mockPrismaService: any = {
    importJob: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    importRow: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    importAnomaly: {
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    expense: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    expenseParticipant: {
      create: jest.fn(),
    },
    settlement: {
      findMany: jest.fn(),
    },
    currency: {
      findMany: jest.fn(),
    },
    exchangeRate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  mockPrismaService.$transaction.mockImplementation((cb: any) => cb(mockPrismaService));

  const mockLedgerSyncService = {
    syncExpenseLedger: jest.fn(),
  };

  const mockEventsGateway = {
    emitToRoom: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LedgerSyncService, useValue: mockLedgerSyncService },
        { provide: EventsGateway, useValue: mockEventsGateway },
      ],
    }).compile();

    service = module.get<ImportService>(ImportService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadCsv - Hash and Duplicates', () => {
    it('should throw ConflictException if file with same hash was already uploaded', async () => {
      const mockFile = {
        buffer: Buffer.from('date,description,amount,paid_by\n2026-06-13,Dinner,100,Aisha'),
        originalname: 'test.csv',
      } as Express.Multer.File;

      mockPrismaService.importJob.findFirst.mockResolvedValue({ id: 'job-123', status: 'reviewing' });

      await expect(
        service.uploadCsv('group-123', 'user-uploader', mockFile)
      ).rejects.toThrow(ConflictException);

      expect(mockPrismaService.importJob.findFirst).toHaveBeenCalled();
    });
  });

  describe('CSV Parsing Delimiters', () => {
    it('should support comma, semicolon, and pipe as delimiters for participants list', async () => {
      const csvContent = 'date,description,amount,paid_by,split_method,participants\n' +
        '2026-06-13,Dinner,300,aisha@example.com,equal,aisha@example.com|rohan@example.com;john@example.com';
      const mockFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'test.csv',
      } as Express.Multer.File;

      mockPrismaService.importJob.findFirst.mockResolvedValue(null);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-A', email: 'aisha@example.com', displayName: 'Aisha', memberships: [] },
        { id: 'user-B', email: 'rohan@example.com', displayName: 'Rohan', memberships: [] },
        { id: 'user-C', email: 'john@example.com', displayName: 'John', memberships: [] },
      ]);
      mockPrismaService.expense.findMany.mockResolvedValue([]);
      mockPrismaService.settlement.findMany.mockResolvedValue([]);
      mockPrismaService.currency.findMany.mockResolvedValue([{ code: 'INR' }]);
      mockPrismaService.exchangeRate.findMany.mockResolvedValue([]);
      mockPrismaService.importJob.create.mockResolvedValue({ id: 'job-123' });

      await service.uploadCsv('group-123', 'user-uploader', mockFile);

      // Verify created import rows parse participants as a flat array
      expect(mockPrismaService.importRow.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          parsedData: expect.objectContaining({
            participants: expect.arrayContaining([
              expect.objectContaining({ nameOrEmail: 'aisha@example.com' }),
              expect.objectContaining({ nameOrEmail: 'rohan@example.com' }),
              expect.objectContaining({ nameOrEmail: 'john@example.com' }),
            ]),
          }),
        }),
      }));
    });
  });

  describe('FOREIGN_CURRENCY_NO_RATE Anomaly', () => {
    it('should trigger FOREIGN_CURRENCY_NO_RATE error if non-INR currency rate is missing', async () => {
      const csvContent = 'date,description,amount,currency,paid_by\n' +
        '2026-06-13,Dinner,100,USD,aisha@example.com';
      const mockFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'test.csv',
      } as Express.Multer.File;

      mockPrismaService.importJob.findFirst.mockResolvedValue(null);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-A', email: 'aisha@example.com', displayName: 'Aisha', memberships: [{ groupId: 'group-123', joinedAt: new Date('2026-06-01') }] },
      ]);
      mockPrismaService.expense.findMany.mockResolvedValue([]);
      mockPrismaService.settlement.findMany.mockResolvedValue([]);
      mockPrismaService.currency.findMany.mockResolvedValue([{ code: 'INR' }, { code: 'USD' }]);
      mockPrismaService.exchangeRate.findMany.mockResolvedValue([]); // No rates seeded
      mockPrismaService.importJob.create.mockResolvedValue({ id: 'job-123' });

      await service.uploadCsv('group-123', 'user-uploader', mockFile);

      // Verify row creation includes FOREIGN_CURRENCY_NO_RATE error anomaly
      expect(mockPrismaService.importRow.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          anomalies: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ anomalyType: 'FOREIGN_CURRENCY_NO_RATE', severity: 'error' }),
            ]),
          }),
        }),
      }));
    });
  });

  describe('PRE_MEMBERSHIP_DATE Anomaly', () => {
    it('should trigger PRE_MEMBERSHIP_DATE warning if date is before member join date', async () => {
      const csvContent = 'date,description,amount,paid_by\n' +
        '2026-06-01,Dinner,100,aisha@example.com';
      const mockFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'test.csv',
      } as Express.Multer.File;

      mockPrismaService.importJob.findFirst.mockResolvedValue(null);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-A', email: 'aisha@example.com', displayName: 'Aisha', memberships: [{ groupId: 'group-123', joinedAt: new Date('2026-06-15') }] },
      ]);
      mockPrismaService.expense.findMany.mockResolvedValue([]);
      mockPrismaService.settlement.findMany.mockResolvedValue([]);
      mockPrismaService.currency.findMany.mockResolvedValue([{ code: 'INR' }]);
      mockPrismaService.exchangeRate.findMany.mockResolvedValue([]);
      mockPrismaService.importJob.create.mockResolvedValue({ id: 'job-123' });

      await service.uploadCsv('group-123', 'user-uploader', mockFile);

      expect(mockPrismaService.importRow.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          anomalies: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ anomalyType: 'PRE_MEMBERSHIP_DATE', severity: 'warning' }),
            ]),
          }),
        }),
      }));
    });
  });

  describe('Approve Row Resolutions', () => {
    it('should apply CREATE_IMPORT_MEMBERSHIP resolution and calculate leftAt correctly if future membership exists', async () => {
      const mockRow = {
        id: 'row-123',
        jobId: 'job-123',
        status: 'pending',
        parsedData: {
          date: '2026-06-01',
          description: 'Dinner',
          amount: 100,
          currency: 'INR',
          paidByUserId: 'user-A',
          splitMethod: 'equal',
          participants: [{ nameOrEmail: 'aisha@example.com', userId: 'user-A' }],
        },
        anomalies: [
          { id: 'an-1', anomalyType: 'INACTIVE_MEMBER', severity: 'warning', detail: 'The payer Aisha was not active' },
        ],
      };

      mockPrismaService.importRow.findFirst.mockResolvedValue(mockRow);
      mockPrismaService.membership.findFirst.mockResolvedValue({ joinedAt: new Date('2026-06-15') }); // Future membership
      mockPrismaService.importRow.update.mockResolvedValue({ id: 'row-123', status: 'approved' });

      const dto = {
        resolutions: [
          { anomalyId: 'an-1', action: 'CREATE_IMPORT_MEMBERSHIP' as any },
        ],
      };

      await service.approveRow('group-123', 'job-123', 'row-123', 'user-admin', dto);

      // Verify the new membership is created with leftAt set to 1s before the future join date
      expect(mockPrismaService.membership.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          groupId: 'group-123',
          userId: 'user-A',
          joinedAt: new Date('2026-06-01'),
          leftAt: new Date(new Date('2026-06-15').getTime() - 1000),
          source: 'IMPORT_RESOLUTION',
        }),
      }));
      expect(mockPrismaService.importAnomaly.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'an-1' },
      }));
    });

    it('should apply IGNORE_PARTICIPANT resolution and modify participants list', async () => {
      const mockRow = {
        id: 'row-123',
        jobId: 'job-123',
        status: 'pending',
        parsedData: {
          date: '2026-06-13',
          description: 'Dinner',
          amount: 100,
          currency: 'INR',
          paidByUserId: 'user-A',
          splitMethod: 'equal',
          participants: [
            { nameOrEmail: 'aisha@example.com', userId: 'user-A' },
            { nameOrEmail: 'rohan@example.com', userId: 'user-B' },
          ],
        },
        anomalies: [
          { id: 'an-2', anomalyType: 'INACTIVE_MEMBER', severity: 'warning', detail: 'rohan@example.com was inactive' },
        ],
      };

      mockPrismaService.importRow.findFirst.mockResolvedValue(mockRow);
      mockPrismaService.importRow.update.mockResolvedValue({ id: 'row-123', status: 'approved' });

      const dto = {
        resolutions: [
          { anomalyId: 'an-2', action: 'IGNORE_PARTICIPANT' as any },
        ],
      };

      await service.approveRow('group-123', 'job-123', 'row-123', 'user-admin', dto);

      // Verify the parsedData has Rohan removed
      expect(mockPrismaService.importRow.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'row-123' },
        data: expect.objectContaining({
          parsedData: expect.objectContaining({
            participants: [
              expect.objectContaining({ nameOrEmail: 'aisha@example.com' }),
            ],
          }),
        }),
      }));
    });
  });

  describe('Import Idempotency & Concurrency', () => {
    it('should be idempotent and return null if row is already imported', async () => {
      const mockRow = {
        id: 'row-123',
        status: 'imported',
        createdExpenseId: 'exp-123',
      };
      mockPrismaService.importRow.findUnique.mockResolvedValue(mockRow);

      const res = await service.importRow(mockPrismaService as any, 'row-123', 'group-123', 'user-admin');

      expect(res).toBeNull();
      expect(mockPrismaService.expense.create).not.toHaveBeenCalled();
    });

    it('should resolve race conditions safely in simultaneous approveAll/importClean calls', async () => {
      // Simulate double transaction: the first call sets status = imported.
      // The second call loads the row from database inside transaction, finds status = imported, and returns null.
      const mockRowPending = {
        id: 'row-abc',
        rowNumber: 2,
        status: 'approved',
        createdExpenseId: null,
        jobId: 'job-123',
        parsedData: {
          date: '2026-06-13',
          description: 'Pizza',
          amount: 60,
          currency: 'INR',
          paidByUserId: 'user-A',
          splitMethod: 'equal',
          participants: [{ userId: 'user-A' }, { userId: 'user-B' }],
        },
      };

      const mockRowImported = {
        ...mockRowPending,
        status: 'imported',
        createdExpenseId: 'exp-789',
      };

      mockPrismaService.importRow.findUnique
        .mockResolvedValueOnce(mockRowPending)   // Call 1 loads pending
        .mockResolvedValueOnce(mockRowImported); // Call 2 loads already imported

      mockPrismaService.expense.create.mockResolvedValue({ id: 'exp-789' });

      // Run Call 1
      const res1 = await service.importRow(mockPrismaService as any, 'row-abc', 'group-123', 'user-admin');
      expect(res1).toEqual(expect.objectContaining({ id: 'exp-789' }));

      // Run Call 2 (representing a concurrent race condition)
      const res2 = await service.importRow(mockPrismaService as any, 'row-abc', 'group-123', 'user-admin');
      expect(res2).toBeNull(); // Skipped successfully
    });
  });
});
