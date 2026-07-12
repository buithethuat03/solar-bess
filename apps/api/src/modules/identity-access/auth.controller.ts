import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_CONFIG } from '../../config/configuration.module';
import type { AppConfig } from '../../config/environment';
import { AccessGuard } from './access.guard';
import { authenticationHttpError } from './auth-http.errors';
import { AuthService } from './auth.service';
import type { ContextRequest } from './context-request';
import { LoginDto } from './dto/login.dto';

@Controller('v1')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() request: ContextRequest, @Res({ passthrough: true }) response: Response) {
    try {
      const profile = await this.auth.login(dto, this.metadata(request));
      this.setRefreshCookie(response, profile.refreshToken);
      const { refreshToken: _refreshToken, ...body } = profile;
      return body;
    } catch (error) {
      authenticationHttpError(error);
    }
  }

  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Req() request: ContextRequest, @Res({ passthrough: true }) response: Response) {
    const token = (request as Request & { cookies?: Record<string, string> }).cookies?.[this.config.cookie.name];
    try {
      const profile = await this.auth.refresh(token, this.metadata(request));
      this.setRefreshCookie(response, profile.refreshToken);
      const { refreshToken: _refreshToken, ...body } = profile;
      return body;
    } catch (error) {
      authenticationHttpError(error);
    }
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() request: ContextRequest, @Res({ passthrough: true }) response: Response): Promise<void> {
    const token = (request as Request & { cookies?: Record<string, string> }).cookies?.[this.config.cookie.name];
    await this.auth.logout(token, this.metadata(request));
    response.clearCookie(this.config.cookie.name, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(AccessGuard)
  async me(@Req() request: ContextRequest) {
    try {
      return await this.auth.currentIdentity(request.auth!, request.correlationId);
    } catch (error) {
      authenticationHttpError(error);
    }
  }

  private metadata(request: ContextRequest) {
    return {
      ip: request.ip || request.socket.remoteAddress || 'unknown',
      userAgent: request.header('user-agent') ?? '', correlationId: request.correlationId
    };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.cookie.secure,
      sameSite: this.config.cookie.sameSite,
      path: this.config.cookie.path
    } as const;
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(this.config.cookie.name, refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.config.jwt.refreshTtlSeconds * 1_000
    });
  }
}
