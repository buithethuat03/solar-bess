import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AssetEntity, AuditEventEntity, BessPlantEntity, BillOfMaterialsEntity, BomLineEntity,
  CompanyEntity, DocumentRevisionEntity, EquipmentEntity, EquipmentModelEntity, ProjectEntity,
  SolarPlantEntity, UserAccountEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { EngineeringPlantsController } from './engineering-plants.controller';
import { EngineeringPlantsService } from './engineering-plants.service';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, EquipmentModelEntity, BillOfMaterialsEntity, BomLineEntity,
      EquipmentEntity, AssetEntity, SolarPlantEntity, BessPlantEntity,
      DocumentRevisionEntity, CompanyEntity, ProjectEntity, UserAccountEntity
    ])
  ],
  controllers: [EngineeringPlantsController],
  providers: [EngineeringPlantsService]
})
export class EngineeringPlantsModule {}
