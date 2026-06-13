import { Test, TestingModule } from '@nestjs/testing';
import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('GroupsService', () => {
  let service: GroupsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    group: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
  mockPrismaService.$transaction.mockImplementation((cb: any) => cb(mockPrismaService));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createGroup', () => {
    it('should create group and assign creator as admin', async () => {
      const mockGroup = { id: 'group-123', name: 'Trip', icon: '✈️' };
      mockPrismaService.group.create.mockResolvedValue(mockGroup);
      mockPrismaService.membership.create.mockResolvedValue({});

      const result = await service.createGroup('user-creator', { name: 'Trip', icon: '✈️' });

      expect(prisma.group.create).toHaveBeenCalled();
      expect(prisma.membership.create).toHaveBeenCalledWith({
        data: {
          groupId: 'group-123',
          userId: 'user-creator',
          role: 'admin',
          joinedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(mockGroup);
    });
  });

  describe('addMember', () => {
    it('should add new member if there are no overlapping timelines', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-to-add' });
      mockPrismaService.membership.findMany.mockResolvedValue([]);
      mockPrismaService.membership.create.mockResolvedValue({
        id: 'member-row-id',
        groupId: 'group-123',
        userId: 'user-to-add',
        role: 'member',
        joinedAt: new Date(),
        leftAt: null,
        user: { id: 'user-to-add' },
      });

      const result = await service.addMember('group-123', 'user-adder', {
        userId: 'user-to-add',
      });

      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(prisma.membership.findMany).toHaveBeenCalled();
      expect(prisma.membership.create).toHaveBeenCalled();
      expect(result.status).toBe('ACTIVE');
    });

    it('should throw BadRequestException if user is already active', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-to-add' });
      mockPrismaService.membership.findMany.mockResolvedValue([
        { id: 'm-1', joinedAt: new Date(Date.now() - 10000), leftAt: null },
      ]);

      await expect(
        service.addMember('group-123', 'user-adder', { userId: 'user-to-add' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if rejoin date overlaps with historical window', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-to-add' });
      
      const joinedAt = new Date('2026-01-01');
      const leftAt = new Date('2026-03-01');
      
      mockPrismaService.membership.findMany.mockResolvedValue([
        { id: 'm-1', joinedAt, leftAt },
      ]);

      // Rejoining on Feb 1 overlaps!
      await expect(
        service.addMember('group-123', 'user-adder', {
          userId: 'user-to-add',
          joinedAt: '2026-02-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow rejoining after leaving if no overlap', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-to-add' });
      
      const joinedAt = new Date('2026-01-01');
      const leftAt = new Date('2026-03-01');
      
      mockPrismaService.membership.findMany.mockResolvedValue([
        { id: 'm-1', joinedAt, leftAt },
      ]);
      mockPrismaService.membership.create.mockResolvedValue({
        id: 'm-2',
        groupId: 'group-123',
        userId: 'user-to-add',
        role: 'member',
        joinedAt: new Date('2026-04-01'),
        leftAt: null,
        user: { id: 'user-to-add' },
      });

      // Rejoining on Apr 1 is fine
      const result = await service.addMember('group-123', 'user-adder', {
        userId: 'user-to-add',
        joinedAt: '2026-04-01T00:00:00.000Z',
      });

      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('removeMember', () => {
    it('should set leftAt for an active member', async () => {
      const activeMembership = {
        id: 'm-1',
        groupId: 'group-123',
        userId: 'user-to-remove',
        joinedAt: new Date('2026-01-01'),
        leftAt: null,
        role: 'member',
      };
      
      mockPrismaService.membership.findFirst.mockResolvedValue(activeMembership);
      mockPrismaService.membership.update.mockResolvedValue({
        ...activeMembership,
        leftAt: new Date('2026-02-01'),
        user: { id: 'user-to-remove' },
      });

      const result = await service.removeMember('group-123', 'user-to-remove', '2026-02-01T00:00:00.000Z');

      expect(prisma.membership.update).toHaveBeenCalled();
      expect(result.status).toBe('LEFT');
    });

    it('should throw BadRequestException if member is not active', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.removeMember('group-123', 'user-to-remove'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if leaving date is before joining date', async () => {
      const activeMembership = {
        id: 'm-1',
        groupId: 'group-123',
        userId: 'user-to-remove',
        joinedAt: new Date('2026-05-01'),
        leftAt: null,
        role: 'member',
      };
      mockPrismaService.membership.findFirst.mockResolvedValue(activeMembership);

      await expect(
        service.removeMember('group-123', 'user-to-remove', '2026-04-01T00:00:00.000Z'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
