import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, PackageEntity, ProjectEntity, ReportJobEntity, SavedViewEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { SearchReportingController } from './search-reporting.controller';
import { SearchReportingService } from './search-reporting.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, SavedViewEntity, ReportJobEntity, ProjectEntity, PackageEntity
    ])
  ],
  controllers: [SearchReportingController],
  providers: [SearchReportingService]
})
export class SearchReportingModule {}
