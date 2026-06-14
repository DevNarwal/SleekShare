import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Socket } from 'socket.io';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let jwtService: JwtService;
  let prisma: PrismaService;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const mockPrismaService = {
    membership: {
      findFirst: jest.fn(),
    },
    expense: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    jwtService = module.get<JwtService>(JwtService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    let mockSocket: any;

    beforeEach(() => {
      mockSocket = {
        handshake: {
          query: {},
          headers: {},
        },
        data: {},
        disconnect: jest.fn(),
      };
    });

    it('should disconnect if no token is provided in handshake', async () => {
      await gateway.handleConnection(mockSocket);
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should authenticate and set userId in socket data if valid query token is provided', async () => {
      mockSocket.handshake.query.token = 'valid-token';
      mockJwtService.verify.mockReturnValue({ sub: 'user-A', email: 'aisha@example.com' });

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(mockSocket.data.userId).toBe('user-A');
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });

    it('should authenticate and set userId if valid authorization header token is provided', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer valid-auth-token';
      mockJwtService.verify.mockReturnValue({ sub: 'user-A', email: 'aisha@example.com' });

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-auth-token');
      expect(mockSocket.data.userId).toBe('user-A');
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect if token verification fails', async () => {
      mockSocket.handshake.query.token = 'invalid-token';
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleJoinGroup', () => {
    let mockSocket: any;

    beforeEach(() => {
      mockSocket = {
        id: 'socket-id',
        data: { userId: 'user-A' },
        join: jest.fn(),
        emit: jest.fn(),
      };
    });

    it('should allow joining group room if user is a member', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({ id: 'mem-1' });

      await gateway.handleJoinGroup(mockSocket, 'group-123');

      expect(prisma.membership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { groupId: 'group-123', userId: 'user-A' },
        })
      );
      expect(mockSocket.join).toHaveBeenCalledWith('group:group-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('joinedRoom', { room: 'group:group-123' });
    });

    it('should send error event and block joining room if user is not a member', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      await gateway.handleJoinGroup(mockSocket, 'group-123');

      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Unauthorized room access' });
    });
  });

  describe('handleJoinExpense', () => {
    let mockSocket: any;

    beforeEach(() => {
      mockSocket = {
        id: 'socket-id',
        data: { userId: 'user-A' },
        join: jest.fn(),
        emit: jest.fn(),
      };
    });

    it('should allow joining room if user is a member of the expense group', async () => {
      mockPrismaService.expense.findUnique.mockResolvedValue({ groupId: 'group-123' });
      mockPrismaService.membership.findFirst.mockResolvedValue({ id: 'mem-1' });

      await gateway.handleJoinExpense(mockSocket, 'exp-123');

      expect(mockSocket.join).toHaveBeenCalledWith('expense:exp-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('joinedRoom', { room: 'expense:exp-123' });
    });
  });

  describe('handleTyping', () => {
    let mockSocket: any;

    beforeEach(() => {
      mockSocket = {
        id: 'socket-id',
        data: { userId: 'user-A' },
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };
    });

    it('should broadcast typing indicator to expense room excluding sender', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ displayName: 'Aisha' });

      await gateway.handleTyping(mockSocket, { expenseId: 'exp-123', isTyping: true });

      expect(mockSocket.to).toHaveBeenCalledWith('expense:exp-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('typing', {
        userId: 'user-A',
        displayName: 'Aisha',
        isTyping: true,
      });
    });
  });
});
