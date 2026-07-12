import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { loadDatabaseConfig } from '../config/environment';
import { databaseEntities } from './entities';
import { CreateAuthBase1720699200000 } from './migrations/1720699200000-CreateAuthBase';
import { CreateProjectMaster1783728000000 } from './migrations/1783728000000-CreateProjectMaster';
import { CreateOperationalFoundation1783729000000 } from './migrations/1783729000000-CreateOperationalFoundation';
import { CreateProjectControls1783730000000 } from './migrations/1783730000000-CreateProjectControls';

export function typeOrmOptions(databaseUrl = loadDatabaseConfig().url): DataSourceOptions {
  return {
    type: 'postgres', url: databaseUrl, entities: databaseEntities,
    migrations: [
      CreateAuthBase1720699200000,
      CreateProjectMaster1783728000000,
      CreateOperationalFoundation1783729000000,
      CreateProjectControls1783730000000
    ],
    synchronize: false, logging: false
  };
}

const AppDataSource = new DataSource(typeOrmOptions());
export default AppDataSource;
