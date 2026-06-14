import { Test, TestingModule } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: PrismaService;
  let eventsGateway: EventsGateway;

  const mockPrismaService = {
    expense: {
      findUnique: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEventsGateway = {
    emitToRoom: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventsGateway, useValue: mockEventsGateway },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    prisma = module.get<PrismaService>(PrismaService);
    eventsGateway = module.get<EventsGateway>(EventsGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMessages', () => {
    it('should throw ForbiddenException if user is not in the group of the expense', async () => {
      mockPrismaService.expense.findUnique.mockResolvedValue({ groupId: 'group-123', isDeleted: false });
      mockPrismaService.membership.findFirst.mockResolvedValue(null); // Not a member

      await expect(service.getMessages('exp-123', 'user-A')).rejects.toThrow(ForbiddenException);
    });

    it('should retrieve messages successfully if user is a member', async () => {
      const mockMessages = [
        { id: 'm-1', content: 'Dinner was nice', author: { id: 'user-A', displayName: 'Aisha' } },
      ];
      mockPrismaService.expense.findUnique.mockResolvedValue({ groupId: 'group-123', isDeleted: false });
      mockPrismaService.membership.findFirst.mockResolvedValue({ id: 'mem-1' });
      mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

      const res = await service.getMessages('exp-123', 'user-A');
      expect(res).toEqual(mockMessages);
      expect(mockPrismaService.message.findMany).toHaveBeenCalled();
    });
  });

  describe('createMessage', () => {
    it('should create message and emit message.created to the socket room', async () => {
      const mockMessage = { id: 'm-2', content: 'Who paid?', author: { id: 'user-A' } };
      mockPrismaService.expense.findUnique.mockResolvedValue({ groupId: 'group-123', isDeleted: false });
      mockPrismaService.membership.findFirst.mockResolvedValue({ id: 'mem-1' });
      mockPrismaService.message.create.mockResolvedValue(mockMessage);

      const res = await service.createMessage('exp-123', 'user-A', { content: 'Who paid?' });

      expect(res).toEqual(mockMessage);
      expect(mockPrismaService.message.create).toHaveBeenCalled();
      expect(mockEventsGateway.emitToRoom).toHaveBeenCalledWith('expense:exp-123', 'message.created', mockMessage);
    });
  });

  describe('updateMessage', () => {
    it('should throw ForbiddenException if editor is not the author of the comment', async () => {
      mockPrismaService.expense.findUnique.mockResolvedValue({ groupId: 'group-123', isDeleted: false });
      mockPrismaService.membership.findFirst.mockResolvedValue({ id: 'mem-1' });
      mockPrismaService.message.findFirst.mockResolvedValue({ id: 'm-1', authorId: 'user-B', content: 'original' });

      await expect(
        service.updateMessage('exp-123', 'm-1', 'user-A', { content: 'new content' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('should edit comment and emit message.updated if editor is the author', async () => {
      const mockUpdated = { id: 'm-1', authorId: 'user-A', content: 'edited content' };
      mockPrismaService.expense.findUnique.mockResolvedValue({ groupId: 'group-123', isDeleted: false });
      mockPrismaService.membership.findFirst.mockResolvedValue({ id: 'mem-1' });
      mockPrismaService.message.findFirst.mockResolvedValue({ id: 'm-1', authorId: 'user-A', content: 'original' });
      mockPrismaService.message.update.mockResolvedValue(mockUpdated);

      const res = await service.updateMessage('exp-123', 'm-1', 'user-A', { content: 'edited content' });

      expect(res).toEqual(mockUpdated);
      expect(mockPrismaService.message.update).toHaveBeenCalled();
      expect(mockEventsGateway.emitToRoom).toHaveBeenCalledWith('expense:exp-123', 'message.updated', mockUpdated);
    });
  });

  describe('deleteMessage', () => {
    it('should allow deletion if user is group admin even if not the author', async () => {
      const mockDeleted = { id: 'm-1', authorId: 'user-B', isDeleted: true };
      mockPrismaService.expense.findUnique.mockResolvedValue({ groupId: 'group-123', isDeleted: false });
      mockPrismaService.membership.findFirst
        .mockResolvedValueOnce({ id: 'mem-admin', role: 'admin' }) // check membership in verifyGroupMembership
        .mockResolvedValueOnce({ id: 'mem-admin', role: 'admin' }); // check membership in deleteMessage (role query)
      
      mockPrismaService.message.findFirst.mockResolvedValue({ id: 'm-1', authorId: 'user-B' });
      mockPrismaService.message.update.mockResolvedValue(mockDeleted);

      const res = await service.deleteMessage('exp-123', 'm-1', 'user-admin');

      expect(res).toEqual(mockDeleted);
      expect(mockEventsGateway.emitToRoom).toHaveBeenCalledWith('expense:exp-123', 'message.deleted', { messageId: 'm-1' });
    });
  });
});
