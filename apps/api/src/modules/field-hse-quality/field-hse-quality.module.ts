import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, CapaActionEntity, DailyLogEntity, HseIncidentEntity, InspectionEntity,
  InspectionTestPlanEntity, NcrDispositionCycleEntity, NcrEntity, PackageEntity,
  PermitToWorkEntity, ProjectEntity, PunchClosureCycleEntity, PunchItemEntity,
  QuantityProgressRecordEntity, SiteEntity, StopWorkActionEntity, UserAccountEntity,
  WbsNodeEntity, WorkfrontEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { FieldHseQualityController } from './field-hse-quality.controller';
import { FieldOperationsService } from './field-operations.service';
import { QualityControlService } from './quality-control.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, WorkfrontEntity, DailyLogEntity, QuantityProgressRecordEntity,
      PermitToWorkEntity, HseIncidentEntity, StopWorkActionEntity, InspectionTestPlanEntity,
      InspectionEntity, NcrEntity, NcrDispositionCycleEntity, PunchItemEntity,
      PunchClosureCycleEntity, CapaActionEntity,
      ProjectEntity, PackageEntity, SiteEntity, WbsNodeEntity, UserAccountEntity
    ])
  ],
  controllers: [FieldHseQualityController],
  providers: [FieldOperationsService, QualityControlService]
})
export class FieldHseQualityModule {}
