import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import { NotificationListQueryDto } from './dto/notification.dto';
import { NotificationService } from './notification.service';

@Controller('v1/notifications')
@UseGuards(AccessGuard, PermissionGuard)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  @RequirePermission('notification.read')
  async list(
    @Req() request: ContextRequest,
    @Query() query: NotificationListQueryDto
  ) {
    const result = await this.service.list(this.context(request), query);
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
  }

  @Post(':notificationId\\:acknowledge')
  @HttpCode(200)
  @RequirePermission('notification.acknowledge')
  async acknowledge(
    @Req() request: ContextRequest,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() _body: unknown
  ) {
    return this.resource(await this.service.acknowledge(
      this.context(request), notificationId, this.idempotencyKey(key)
    ), request);
  }

  private context(request: ContextRequest) {
    return { ...request.auth!, correlationId: request.correlationId };
  }

  private resource<T>(data: T, request: ContextRequest) {
    return { data, correlationId: request.correlationId };
  }

  private idempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 200) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key phải có từ 8 đến 200 ký tự', retryable: false
      });
    }
    return key;
  }
}
