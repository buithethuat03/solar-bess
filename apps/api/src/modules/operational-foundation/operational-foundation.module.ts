import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CommandReceiptEntity, EventConsumptionEntity, TransactionalOutboxEventEntity
} from '../../database/entities';
import { CommandReceiptService } from './command-receipt.service';
import { OutboxService } from './outbox.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionalOutboxEventEntity, EventConsumptionEntity, CommandReceiptEntity
    ])
  ],
  providers: [CommandReceiptService, OutboxService, RedisService],
  exports: [CommandReceiptService, OutboxService, RedisService]
})
export class OperationalFoundationModule {}
