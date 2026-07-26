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
import { CreateFieldHseQuality1783746000000 } from './migrations/1783746000000-CreateFieldHseQuality';
import { GrantFieldHseQualityPermissions1783747000000 } from './migrations/1783747000000-GrantFieldHseQualityPermissions';
import { CreateProcurementLogistics1783748000000 } from './migrations/1783748000000-CreateProcurementLogistics';
import { GrantProcurementPermissions1783749000000 } from './migrations/1783749000000-GrantProcurementPermissions';
import { CreateDelegations1783754000000 } from './migrations/1783754000000-CreateDelegations';
import { CreateSavedViewsAndReportJobs1783755000000 } from './migrations/1783755000000-CreateSavedViewsAndReportJobs';
import { ExtendWorkflowEscalationNotificationSource1783756000000 } from './migrations/1783756000000-ExtendWorkflowEscalationNotificationSource';
import { GrantCrossCuttingPermissions1783757000000 } from './migrations/1783757000000-GrantCrossCuttingPermissions';
import { CreateOpportunity1783752000000 } from './migrations/1783752000000-CreateOpportunity';
import { GrantOpportunityPermissions1783753000000 } from './migrations/1783753000000-GrantOpportunityPermissions';

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
      GrantEngineeringPermissions1783745000000,
      CreateFieldHseQuality1783746000000,
      GrantFieldHseQualityPermissions1783747000000,
      CreateProcurementLogistics1783748000000,
      GrantProcurementPermissions1783749000000,
      CreateOpportunity1783752000000,
      GrantOpportunityPermissions1783753000000,
      CreateDelegations1783754000000,
      CreateSavedViewsAndReportJobs1783755000000,
      ExtendWorkflowEscalationNotificationSource1783756000000,
      GrantCrossCuttingPermissions1783757000000
    ],
    synchronize: false, logging: false
  };
}

const AppDataSource = new DataSource(typeOrmOptions());
export default AppDataSource;
