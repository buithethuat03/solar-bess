import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, ChangeRequestEntity, IssueEntity, PackageEntity, ProjectEntity,
  RiskEntity, RiskIssueActionEntity, RiskIssueClosureCycleEntity, ScheduleBaselineEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { APPROVED_CHANGE_READER } from './approved-change-reader.port';
import { TypeOrmApprovedChangeReader } from './approved-change-reader.service';
import { RiskChangeController } from './risk-change.controller';
import { RiskChangeService } from './risk-change.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, ChangeRequestEntity, IssueEntity, PackageEntity, ProjectEntity,
      RiskEntity, RiskIssueActionEntity, RiskIssueClosureCycleEntity, ScheduleBaselineEntity
    ])
  ],
  controllers: [RiskChangeController],
  providers: [
    RiskChangeService, TypeOrmApprovedChangeReader,
    { provide: APPROVED_CHANGE_READER, useExisting: TypeOrmApprovedChangeReader }
  ],
  exports: [APPROVED_CHANGE_READER]
})
export class RiskChangeModule {}
