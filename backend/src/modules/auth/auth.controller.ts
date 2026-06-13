import { Controller, Post, Body, Req, Res, HttpCode, HttpStatus } from '@nestjs/common';
import * as express from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshTokenCookie(res: express.Response, token: string) {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/', // accessible globally
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    });
  }

  private clearRefreshTokenCookie(res: express.Response) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshTokenCookie(res, result.refreshTokenCookie);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.login(dto);
    this.setRefreshTokenCookie(res, result.refreshTokenCookie);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: express.Request,
    @Body('refreshToken') bodyRefreshToken: string,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    // Check cookie first, fallback to request body for robust API clients
    const token = req.cookies?.refreshToken || bodyRefreshToken;
    const result = await this.authService.refresh(token);
    this.setRefreshTokenCookie(res, result.refreshTokenCookie);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshTokenCookie, // returned in body for non-browser compatibility
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: express.Request,
    @Body('refreshToken') bodyRefreshToken: string,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const token = req.cookies?.refreshToken || bodyRefreshToken;
    await this.authService.logout(token);
    this.clearRefreshTokenCookie(res);
  }
}
