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
      ReconcileRiskChangeRoleGrants1783736000000
    ],
    synchronize: false, logging: false
  };
}

const AppDataSource = new DataSource(typeOrmOptions());
export default AppDataSource;
