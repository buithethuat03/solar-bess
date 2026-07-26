import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, BidEntity, CommitmentEntity, CostCodeEntity, EvaluationEntity,
  GoodsReceiptEntity, InventoryTransactionEntity, PackageEntity, ProjectEntity,
  PurchaseOrderEntity, PurchaseOrderLineEntity, RequisitionEntity, RfqEntity,
  SerialNumberEntity, ShipmentEntity, ShipmentMilestoneEntity, SiteEntity,
  SupplierProfileEntity, UserAccountEntity, WbsNodeEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { ProcurementLogisticsController } from './procurement-logistics.controller';
import { ProcurementLogisticsService } from './procurement-logistics.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, SupplierProfileEntity, RequisitionEntity, RfqEntity, BidEntity,
      EvaluationEntity, PurchaseOrderEntity, PurchaseOrderLineEntity, ShipmentEntity,
      ShipmentMilestoneEntity, GoodsReceiptEntity, InventoryTransactionEntity,
      SerialNumberEntity, CommitmentEntity, CostCodeEntity, PackageEntity, ProjectEntity,
      SiteEntity, UserAccountEntity, WbsNodeEntity
    ])
  ],
  controllers: [ProcurementLogisticsController],
  providers: [ProcurementLogisticsService],
  exports: [ProcurementLogisticsService]
})
export class ProcurementLogisticsModule {}
