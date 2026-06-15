import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  private readonly avatarColors = [
    '#E11D48', // Rose
    '#2563EB', // Blue
    '#16A34A', // Green
    '#D97706', // Amber
    '#7C3AED', // Violet
    '#0891B2', // Cyan
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // Register a new user
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new BadRequestException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    
    // Auto-generate initials from displayName
    const words = dto.displayName.trim().split(/\s+/);
    const avatarInitials = words.length === 1 
      ? dto.displayName.slice(0, 2).toUpperCase() 
      : words.map(w => w[0]).join('').slice(0, 2).toUpperCase();

    // Pick a random avatar color
    const avatarColor = this.avatarColors[Math.floor(Math.random() * this.avatarColors.length)];

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        displayName: dto.displayName,
        avatarInitials,
        avatarColor,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarInitials: true,
        avatarColor: true,
        createdAt: true,
      },
    });

    const { accessToken, rawRefreshToken, tokenId } = await this.generateTokens(user.id, user.email);
    return {
      user,
      accessToken,
      refreshTokenCookie: `${tokenId}:${rawRefreshToken}`,
    };
  }

  // Validate credentials and login user
  async login(dto: LoginDto) {
    const emailToUse = dto.email.trim().toLowerCase();
    console.log(`[AuthService] Login attempt for: "${dto.email}" (processed as: "${emailToUse}")`);
    
    const user = await this.prisma.user.findUnique({
      where: { email: emailToUse },
    });
    
    if (!user) {
      console.log(`[AuthService] Login failed: User with email "${emailToUse}" not found.`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    console.log(`[AuthService] Password comparison match: ${isMatch}`);
    
    if (!isMatch) {
      console.log(`[AuthService] Login failed: Password does not match for user "${emailToUse}".`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const selectUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarInitials: user.avatarInitials,
      avatarColor: user.avatarColor,
      createdAt: user.createdAt,
    };

    const { accessToken, rawRefreshToken, tokenId } = await this.generateTokens(user.id, user.email);
    return {
      user: selectUser,
      accessToken,
      refreshTokenCookie: `${tokenId}:${rawRefreshToken}`,
    };
  }

  // Refresh tokens
  async refresh(refreshTokenCookie: string) {
    if (!refreshTokenCookie || !refreshTokenCookie.includes(':')) {
      throw new UnauthorizedException('Invalid session refresh token');
    }

    const [tokenId, rawRefreshToken] = refreshTokenCookie.split(':');
    
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
      include: { user: true },
    });

    if (!tokenRecord || tokenRecord.revoked || tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    const isMatch = await bcrypt.compare(rawRefreshToken, tokenRecord.tokenHash);
    if (!isMatch) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    // Revoke old refresh token (Soft delete by setting revoked = true)
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revoked: true },
    });

    const user = tokenRecord.user;
    const selectUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarInitials: user.avatarInitials,
      avatarColor: user.avatarColor,
      createdAt: user.createdAt,
    };

    const tokens = await this.generateTokens(user.id, user.email);
    return {
      user: selectUser,
      accessToken: tokens.accessToken,
      refreshTokenCookie: `${tokens.tokenId}:${tokens.rawRefreshToken}`,
    };
  }

  // Revoke session on logout
  async logout(refreshTokenCookie: string) {
    if (!refreshTokenCookie || !refreshTokenCookie.includes(':')) {
      return;
    }
    const [tokenId] = refreshTokenCookie.split(':');
    try {
      await this.prisma.refreshToken.update({
        where: { id: tokenId },
        data: { revoked: true },
      });
    } catch (err) {
      // Ignore if database record doesn't exist
    }
  }

  // Helper: generate Access and Refresh tokens
  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    
    // Access token (15 minutes)
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET || 'dev-secret',
      expiresIn: '15m',
    });

    // Refresh token (7 days)
    const rawRefreshToken = randomUUID();
    const tokenHash = await bcrypt.hash(rawRefreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const tokenRecord = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      rawRefreshToken,
      tokenId: tokenRecord.id,
    };
  }
}
