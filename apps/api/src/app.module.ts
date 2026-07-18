import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware';
import { ConfigurationModule } from './config/configuration.module';
import { DatabaseModule } from './database/database.module';
import { CipherModule } from './modules/cipher/cipher.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { OperationalFoundationModule } from './modules/operational-foundation/operational-foundation.module';
import { ProjectManagementModule } from './modules/project-management/project-management.module';
import { ProjectControlsModule } from './modules/project-controls/project-controls.module';
import { RiskChangeModule } from './modules/risk-change/risk-change.module';

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
    RiskChangeModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
