import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-id-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    displayName: 'Test User',
    avatarInitials: 'TU',
    avatarColor: '#E11D48',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRefreshToken = {
    id: 'token-id-123',
    userId: 'user-id-123',
    tokenHash: 'hashed-refresh-token',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    revoked: false,
    createdAt: new Date(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-access-token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user and generate tokens', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockPrismaService.refreshToken.create.mockResolvedValue(mockRefreshToken);

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User',
      });

      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalled();
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshTokenCookie).toContain(mockRefreshToken.id);
      expect(result.user.email).toBe(mockUser.email);
    });

    it('should throw BadRequestException if email is already registered', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'password123',
          displayName: 'Test User',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('should authenticate credentials and return tokens', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.refreshToken.create.mockResolvedValue(mockRefreshToken);

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshTokenCookie).toContain(mockRefreshToken.id);
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should rotate active token and return new access token', async () => {
      const dbRecord = {
        ...mockRefreshToken,
        user: mockUser,
      };
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(dbRecord);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.refreshToken.update.mockResolvedValue({ ...mockRefreshToken, revoked: true });
      mockPrismaService.refreshToken.create.mockResolvedValue({ ...mockRefreshToken, id: 'new-token-id' });

      const result = await service.refresh('token-id-123:raw-token-value');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { id: 'token-id-123' },
        include: { user: true },
      });
      expect(prisma.refreshToken.update).toHaveBeenCalled();
      expect(result.accessToken).toBe('mock-access-token');
    });

    it('should throw UnauthorizedException if token is revoked or expired', async () => {
      const dbRecord = {
        ...mockRefreshToken,
        revoked: true,
        user: mockUser,
      };
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(dbRecord);

      await expect(
        service.refresh('token-id-123:raw-token-value'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if refresh token value does not match', async () => {
      const dbRecord = {
        ...mockRefreshToken,
        user: mockUser,
      };
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(dbRecord);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.refresh('token-id-123:wrong-value'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
