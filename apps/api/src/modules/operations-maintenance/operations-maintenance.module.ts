import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AlarmCaseEntity, AssetEntity, AuditEventEntity, HseIncidentEntity, MaintenancePlanEntity,
  PermitToWorkEntity, ServiceIncidentEntity, SiteEntity, UserAccountEntity, WarrantyClaimEntity,
  WorkOrderClosureCycleEntity, WorkOrderEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { AlarmIncidentService } from './alarm-incident.service';
import { OperationsMaintenanceController } from './operations-maintenance.controller';
import { WorkOrderService } from './work-order.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, AlarmCaseEntity, ServiceIncidentEntity, WorkOrderEntity,
      WorkOrderClosureCycleEntity, MaintenancePlanEntity, WarrantyClaimEntity,
      AssetEntity, SiteEntity, PermitToWorkEntity, HseIncidentEntity, UserAccountEntity
    ])
  ],
  controllers: [OperationsMaintenanceController],
  providers: [AlarmIncidentService, WorkOrderService]
})
export class OperationsMaintenanceModule {}
