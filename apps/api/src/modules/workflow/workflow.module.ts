import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ApprovalDecisionEntity, AuditEventEntity, ChangeRequestEntity, WorkflowDefinitionEntity,
  WorkflowInstanceEntity, WorkflowVersionEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { ChangeRequestTargetResolver } from './change-request-target.resolver';
import { WorkflowController } from './workflow.controller';
import { WORKFLOW_TARGET_RESOLVER } from './workflow-target.port';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      ApprovalDecisionEntity, AuditEventEntity, ChangeRequestEntity,
      WorkflowDefinitionEntity, WorkflowInstanceEntity, WorkflowVersionEntity
    ])
  ],
  controllers: [WorkflowController],
  providers: [
    WorkflowService, ChangeRequestTargetResolver,
    { provide: WORKFLOW_TARGET_RESOLVER, useExisting: ChangeRequestTargetResolver }
  ]
})
export class WorkflowModule {}
