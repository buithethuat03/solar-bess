import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, CodGateEntity, CodGateReviewCycleEntity, CodPackageEntity,
  CommissioningSystemEntity, DocumentRevisionEntity, HandoverEntity, PackageEntity,
  ProjectEntity, ProjectPartyEntity, TestPackEntity, TestRunEntity, UserAccountEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { CodService } from './cod.service';
import { CommissioningCodController } from './commissioning-cod.controller';
import { CommissioningService } from './commissioning.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, CommissioningSystemEntity, TestPackEntity, TestRunEntity,
      CodGateEntity, CodGateReviewCycleEntity, CodPackageEntity, HandoverEntity,
      DocumentRevisionEntity, ProjectEntity, PackageEntity, ProjectPartyEntity, UserAccountEntity
    ])
  ],
  controllers: [CommissioningCodController],
  providers: [CommissioningService, CodService]
})
export class CommissioningCodModule {}
