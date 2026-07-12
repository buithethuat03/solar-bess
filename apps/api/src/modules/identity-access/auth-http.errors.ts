import { HttpException, UnauthorizedException } from '@nestjs/common';
import { AuthenticationRateLimitedError, InvalidAuthenticationError } from './auth.types';

export function authenticationHttpError(error: unknown): never {
  if (error instanceof AuthenticationRateLimitedError) {
    throw new HttpException({ code: 'AUTH_RATE_LIMITED', message: 'Thử lại sau', retryable: true }, 429);
  }
  if (error instanceof InvalidAuthenticationError) {
    throw new UnauthorizedException({
      code: 'AUTH_INVALID_CREDENTIALS', message: 'Thông tin đăng nhập không hợp lệ', retryable: false
    });
  }
  throw error;
}
