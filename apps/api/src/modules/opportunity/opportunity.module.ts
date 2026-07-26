import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, CompanyEntity, InvestmentScenarioEntity, LegalEntityEntity,
  OpportunityEntity, PortfolioEntity, ProjectEntity, SiteEntity, SurveyPackageEntity,
  UserAccountEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { OpportunityController } from './opportunity.controller';
import { OpportunityService } from './opportunity.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, OpportunityEntity, SurveyPackageEntity, InvestmentScenarioEntity,
      CompanyEntity, LegalEntityEntity, PortfolioEntity, ProjectEntity, SiteEntity,
      UserAccountEntity
    ])
  ],
  controllers: [OpportunityController],
  providers: [OpportunityService]
})
export class OpportunityModule {}
