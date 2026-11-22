import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService, IssuedTokens } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserResponse } from '../users/user-response.util.js';

const REFRESH_COOKIE = 'refreshToken';
// Deliberately NOT httpOnly and scoped to path '/' (not '/auth'): it carries
// no secret, just "a session might exist". The web app's AuthProvider reads
// it from document.cookie before ever calling /auth/refresh, so an
// anonymous visitor or a bot never triggers a doomed refresh attempt (and
// the 401 that would follow).
const SESSION_HINT_COOKIE = 'session_hint';
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    return toUserResponse(user, true);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateCredentials(dto.email, dto.password);
    const tokens = await this.authService.issueTokens(user, this.requestMeta(req));
    this.setRefreshCookie(res, tokens);
    this.setSessionHintCookie(res, tokens);
    return { accessToken: tokens.accessToken, user: toUserResponse(user, true) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      throw new UnauthorizedException('Oturum bulunamadı.');
    }
    const { tokens } = await this.authService.refresh(rawToken, this.requestMeta(req));
    this.setRefreshCookie(res, tokens);
    this.setSessionHintCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/auth', domain: this.cookieDomain() });
    res.clearCookie(SESSION_HINT_COOKIE, { path: '/', domain: this.cookieDomain() });
  }

  @Get('me')
  async me(@CurrentUser() currentUser: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
    if (!user) {
      throw new UnauthorizedException('Oturum geçersiz.');
    }
    return toUserResponse(user, true);
  }

  private requestMeta(req: Request) {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }

  private setRefreshCookie(res: Response, tokens: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      expires: tokens.refreshExpiresAt,
      path: '/auth',
      domain: this.cookieDomain(),
    });
  }

  private setSessionHintCookie(res: Response, tokens: IssuedTokens) {
    res.cookie(SESSION_HINT_COOKIE, '1', {
      httpOnly: false,
      secure: this.isProduction(),
      sameSite: 'lax',
      expires: tokens.refreshExpiresAt,
      path: '/',
      domain: this.cookieDomain(),
    });
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  // Empty/unset = host-only cookie (fine for local dev, where api/web share
  // the "localhost" hostname). See env.validation.ts for the production case.
  private cookieDomain(): string | undefined {
    return this.configService.get<string>('COOKIE_DOMAIN') || undefined;
  }
}
