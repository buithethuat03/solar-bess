import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ActivityDependencyEntity, AuditEventEntity, CompanyEntity, PackageEntity,
  ProgressUpdateEntity, ProjectEntity, ProjectScheduleEntity, ScheduleActivityEntity,
  ScheduleBaselineEntity, ScheduleNotificationEntity, UserAccountEntity, WbsNodeEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { ProjectControlsController } from './project-controls.controller';
import { ProjectControlsService } from './project-controls.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      ActivityDependencyEntity, AuditEventEntity, CompanyEntity, PackageEntity,
      ProgressUpdateEntity, ProjectEntity, ProjectScheduleEntity, ScheduleActivityEntity,
      ScheduleBaselineEntity, ScheduleNotificationEntity, UserAccountEntity, WbsNodeEntity
    ])
  ],
  controllers: [ProjectControlsController],
  providers: [ProjectControlsService]
})
export class ProjectControlsModule {}
