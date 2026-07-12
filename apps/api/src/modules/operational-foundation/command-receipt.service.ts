import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import {
  CommandReceiptEntity, CommandReceiptState
} from '../../database/entities';
import { APP_CONFIG } from '../../config/configuration.module';
import type { AppConfig } from '../../config/environment';

export interface CommandContext {
  tenantId: string;
  userId: string;
  correlationId: string;
}

export interface CommandResultReference {
  resourceType?: string;
  resourceId?: string;
  responseStatus?: number;
}

export interface ExecuteCommandOptions<T> extends CommandResultReference {
  context: CommandContext;
  operation: string;
  idempotencyKey: string;
  request: unknown;
  execute: (manager: EntityManager) => Promise<T>;
  resultReference?: (result: T) => CommandResultReference;
}

@Injectable()
export class CommandReceiptService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  async execute<T>(options: ExecuteCommandOptions<T>): Promise<T> {
    const requestHash = this.requestHash(options.request);
    const existing = await this.find(options);
    if (existing) return this.replay<T>(existing, requestHash);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(CommandReceiptEntity);
        let current = await repository.findOneBy({
          tenantId: options.context.tenantId,
          actorId: options.context.userId,
          operation: options.operation,
          idempotencyKey: options.idempotencyKey
        });
        if (current && current.expiresAt <= new Date()) {
          await repository.delete({ id: current.id, tenantId: current.tenantId });
          current = null;
        }
        if (current) return this.replay<T>(current, requestHash);

        const receipt = repository.create({
          id: randomUUID(),
          tenantId: options.context.tenantId,
          actorType: 'USER',
          actorId: options.context.userId,
          operation: options.operation,
          idempotencyKey: options.idempotencyKey,
          requestHash,
          state: CommandReceiptState.IN_PROGRESS,
          responseStatus: options.responseStatus ?? null,
          responseBody: null,
          resourceType: options.resourceType ?? null,
          resourceId: options.resourceId ?? null,
          correlationId: options.context.correlationId,
          expiresAt: new Date(Date.now() + this.config.operational.commandReceiptRetentionMs)
        });
        await repository.insert(receipt);
        const result = await options.execute(manager);
        const reference = options.resultReference?.(result) ?? {};
        receipt.state = CommandReceiptState.COMPLETED;
        receipt.responseStatus = reference.responseStatus ?? receipt.responseStatus ?? 202;
        receipt.responseBody = this.jsonValue(result);
        receipt.resourceType = reference.resourceType ?? receipt.resourceType;
        receipt.resourceId = reference.resourceId ?? receipt.resourceId;
        await repository.save(receipt);
        return result;
      });
    } catch (error) {
      // Only a collision on the receipt scope represents the same command
      // racing in another request. Business unique constraints must bubble up
      // to the owning module so it can return its domain-specific conflict.
      if (!this.isReceiptScopeViolation(error)) throw error;
      const concurrent = await this.find(options);
      if (concurrent) return this.replay<T>(concurrent, requestHash);
      throw this.inProgress();
    }
  }

  private async find<T>(options: ExecuteCommandOptions<T>): Promise<CommandReceiptEntity | null> {
    const repository = this.dataSource.getRepository(CommandReceiptEntity);
    const receipt = await repository.findOneBy({
      tenantId: options.context.tenantId,
      actorId: options.context.userId,
      operation: options.operation,
      idempotencyKey: options.idempotencyKey
    });
    if (receipt && receipt.expiresAt <= new Date()) {
      await repository.delete({ id: receipt.id, tenantId: receipt.tenantId });
      return null;
    }
    return receipt;
  }

  private replay<T>(receipt: CommandReceiptEntity, requestHash: string): T {
    if (receipt.requestHash !== requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency-Key đã được dùng với nội dung yêu cầu khác',
        retryable: false
      });
    }
    if (receipt.state !== CommandReceiptState.COMPLETED || receipt.responseBody === null) {
      throw this.inProgress();
    }
    return receipt.responseBody as T;
  }

  private inProgress(): ConflictException {
    return new ConflictException({
      code: 'COMMAND_IN_PROGRESS',
      message: 'Yêu cầu cùng Idempotency-Key đang được xử lý; hãy thử lại',
      retryable: true
    });
  }

  private requestHash(value: unknown): string {
    return createHash('sha256').update(this.stableSerialize(value)).digest('hex');
  }

  private stableSerialize(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${this.stableSerialize(record[key])}`
    )).join(',')}}`;
  }

  private jsonValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private isReceiptScopeViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };
    const code = candidate.code ?? candidate.driverError?.code;
    const constraint = candidate.constraint ?? candidate.driverError?.constraint;
    return code === '23505' && constraint === 'uq_command_receipt_scope';
  }
}
