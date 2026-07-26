import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, BudgetVersionEntity, CommitmentEntity, ContractAppendixEntity,
  ContractEntity, ContractPartyEntity, CostCodeEntity, DocumentEntity, FxSnapshotEntity,
  InvoiceEntity, LegalEntityEntity, ObligationEntity, PaymentComponentEntity, PaymentEntity,
  ProjectEntity, UserAccountEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { ContractCostController } from './contract-cost.controller';
import { ContractCostService } from './contract-cost.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, ContractEntity, ContractPartyEntity, ContractAppendixEntity,
      ObligationEntity, CostCodeEntity, BudgetVersionEntity, CommitmentEntity,
      InvoiceEntity, PaymentEntity, PaymentComponentEntity, FxSnapshotEntity,
      DocumentEntity, LegalEntityEntity, ProjectEntity, UserAccountEntity
    ])
  ],
  controllers: [ContractCostController],
  providers: [ContractCostService]
})
export class ContractCostModule {}
