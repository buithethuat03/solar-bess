import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { authenticationHttpError } from './auth-http.errors';
import type { ContextRequest } from './context-request';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ContextRequest>();
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Cần đăng nhập', retryable: false });
    }
    try {
      request.auth = await this.auth.validateAccess(authorization.slice(7));
    } catch (error) {
      authenticationHttpError(error);
    }
    const tenantHeader = request.header('x-tenant-id');
    if (!tenantHeader) {
      throw new ForbiddenException({ code: 'TENANT_REQUIRED', message: 'Thiếu tenant context', retryable: false });
    }
    if (tenantHeader !== request.auth!.tenantId) {
      throw new ForbiddenException({ code: 'TENANT_MISMATCH', message: 'Tenant context không hợp lệ', retryable: false });
    }
    return true;
  }
}
