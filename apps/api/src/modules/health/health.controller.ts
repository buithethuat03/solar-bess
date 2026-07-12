import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import { RedisService } from '../operational-foundation/redis.service';

@Controller()
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService
  ) {}

  @Get('health')
  async health(): Promise<{ status: 'ok'; database: 'ok'; redis: 'ok' }> {
    return this.ready();
  }

  @Get('health/live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('health/ready')
  async ready(): Promise<{ status: 'ok'; database: 'ok'; redis: 'ok' }> {
    await this.dataSource.query('SELECT 1');
    await this.redis.ping();
    if (await this.dataSource.showMigrations()) throw new Error('Database migration is pending');
    return { status: 'ok', database: 'ok', redis: 'ok' };
  }
}

@Controller('v1/system')
@UseGuards(AccessGuard, PermissionGuard)
export class SystemStatusController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService
  ) {}

  @Get('status')
  @RequirePermission('systemStatus.read', 'TENANT')
  async status(@Req() request: ContextRequest) {
    await this.redis.ping();
    const [outbox] = await this.dataSource.query<Array<{
      pending: string;
      failed: string;
      oldest_pending_at: Date | null;
    }>>(
      `SELECT
        count(*) FILTER (WHERE status IN ('PENDING','PROCESSING'))::text AS pending,
        count(*) FILTER (WHERE status = 'FAILED')::text AS failed,
        min(occurred_at) FILTER (WHERE status IN ('PENDING','PROCESSING')) AS oldest_pending_at
       FROM transactional_outbox_events WHERE tenant_id = $1`,
      [request.auth!.tenantId]
    );
    return {
      data: {
        status: 'ok', database: 'ok', redis: 'ok',
        outbox: {
          pending: Number(outbox.pending), failed: Number(outbox.failed),
          oldestPendingAt: outbox.oldest_pending_at
        }
      },
      correlationId: request.correlationId
    };
  }
}
