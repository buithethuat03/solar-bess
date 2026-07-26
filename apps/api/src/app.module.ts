import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware';
import { ConfigurationModule } from './config/configuration.module';
import { DatabaseModule } from './database/database.module';
import { CipherModule } from './modules/cipher/cipher.module';
import { ContractCostModule } from './modules/contract-cost/contract-cost.module';
import { DocumentControlModule } from './modules/document-control/document-control.module';
import { EngineeringPlantsModule } from './modules/engineering-plants/engineering-plants.module';
import { FieldHseQualityModule } from './modules/field-hse-quality/field-hse-quality.module';
import { SearchReportingModule } from './modules/search-reporting/search-reporting.module';
import { OpportunityModule } from './modules/opportunity/opportunity.module';
import { ProcurementLogisticsModule } from './modules/procurement-logistics/procurement-logistics.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OperationalFoundationModule } from './modules/operational-foundation/operational-foundation.module';
import { ProjectManagementModule } from './modules/project-management/project-management.module';
import { ProjectControlsModule } from './modules/project-controls/project-controls.module';
import { RiskChangeModule } from './modules/risk-change/risk-change.module';
import { WorkflowModule } from './modules/workflow/workflow.module';

@Module({
  imports: [
    CipherModule,
    ConfigurationModule,
    DatabaseModule,
    HealthModule,
    OperationalFoundationModule,
    IdentityAccessModule,
    ProjectManagementModule,
    ProjectControlsModule,
    RiskChangeModule,
    NotificationModule,
    WorkflowModule,
    DocumentControlModule,
    ContractCostModule,
    EngineeringPlantsModule,
    FieldHseQualityModule,
    ProcurementLogisticsModule,
    OpportunityModule,
    SearchReportingModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
