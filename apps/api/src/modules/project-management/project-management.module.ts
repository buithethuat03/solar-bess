import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, CompanyEntity, LegalEntityEntity, PortfolioEntity, ProjectEntity,
  ProjectPartyEntity, SiteEntity, UserAccountEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { ProjectManagementController } from './project-management.controller';
import { ProjectManagementService } from './project-management.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, CompanyEntity, LegalEntityEntity, PortfolioEntity, ProjectEntity,
      SiteEntity, ProjectPartyEntity, UserAccountEntity
    ])
  ],
  controllers: [ProjectManagementController],
  providers: [ProjectManagementService]
})
export class ProjectManagementModule {}
