import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { loadDatabaseConfig } from '../config/environment';
import { databaseEntities } from './entities';
import { CreateAuthBase1720699200000 } from './migrations/1720699200000-CreateAuthBase';
import { CreateProjectMaster1783728000000 } from './migrations/1783728000000-CreateProjectMaster';
import { CreateOperationalFoundation1783729000000 } from './migrations/1783729000000-CreateOperationalFoundation';
import { CreateProjectControls1783730000000 } from './migrations/1783730000000-CreateProjectControls';
import { CreateRiskIssueControl1783731000000 } from './migrations/1783731000000-CreateRiskIssueControl';
import { CreateChangeControl1783732000000 } from './migrations/1783732000000-CreateChangeControl';
import { GeneralizeNotifications1783733000000 } from './migrations/1783733000000-GeneralizeNotifications';
import { AddActionResidualRationale1783734000000 } from './migrations/1783734000000-AddActionResidualRationale';
import { ReconcileRiskChangeRuntimeDrift1783735000000 } from './migrations/1783735000000-ReconcileRiskChangeRuntimeDrift';
import { ReconcileRiskChangeRoleGrants1783736000000 } from './migrations/1783736000000-ReconcileRiskChangeRoleGrants';
import { GrantNotificationPermissions1783737000000 } from './migrations/1783737000000-GrantNotificationPermissions';
import { CreateWorkflowEngine1783738000000 } from './migrations/1783738000000-CreateWorkflowEngine';
import { GrantWorkflowPermissions1783739000000 } from './migrations/1783739000000-GrantWorkflowPermissions';
import { CreateDocumentControl1783740000000 } from './migrations/1783740000000-CreateDocumentControl';
import { GrantDocumentPermissions1783741000000 } from './migrations/1783741000000-GrantDocumentPermissions';
import { CreateContractCost1783742000000 } from './migrations/1783742000000-CreateContractCost';
import { GrantContractCostPermissions1783743000000 } from './migrations/1783743000000-GrantContractCostPermissions';
import { CreateEngineeringPlants1783744000000 } from './migrations/1783744000000-CreateEngineeringPlants';
import { GrantEngineeringPermissions1783745000000 } from './migrations/1783745000000-GrantEngineeringPermissions';

export function typeOrmOptions(databaseUrl = loadDatabaseConfig().url): DataSourceOptions {
  return {
    type: 'postgres', url: databaseUrl, entities: databaseEntities,
    migrations: [
      CreateAuthBase1720699200000,
      CreateProjectMaster1783728000000,
      CreateOperationalFoundation1783729000000,
      CreateProjectControls1783730000000,
      CreateRiskIssueControl1783731000000,
      CreateChangeControl1783732000000,
      GeneralizeNotifications1783733000000,
      AddActionResidualRationale1783734000000,
      ReconcileRiskChangeRuntimeDrift1783735000000,
      ReconcileRiskChangeRoleGrants1783736000000,
      GrantNotificationPermissions1783737000000,
      CreateWorkflowEngine1783738000000,
      GrantWorkflowPermissions1783739000000,
      CreateDocumentControl1783740000000,
      GrantDocumentPermissions1783741000000,
      CreateContractCost1783742000000,
      GrantContractCostPermissions1783743000000,
      CreateEngineeringPlants1783744000000,
      GrantEngineeringPermissions1783745000000
    ],
    synchronize: false, logging: false
  };
}

const AppDataSource = new DataSource(typeOrmOptions());
export default AppDataSource;
