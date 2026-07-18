import { AuditEventEntity } from './audit-event.entity';
import { AuthenticationSessionEntity } from './authentication-session.entity';
import { LocalCredentialEntity } from './local-credential.entity';
import { TenantEntity } from './tenant.entity';
import { UserAccountEntity } from './user-account.entity';
import { CompanyEntity } from './company.entity';
import { CommandReceiptEntity } from './command-receipt.entity';
import { EventConsumptionEntity } from './event-consumption.entity';
import { LegalEntityEntity } from './legal-entity.entity';
import { PortfolioEntity } from './portfolio.entity';
import { ProjectEntity } from './project.entity';
import { ProjectPartyEntity } from './project-party.entity';
import { RoleAssignmentEntity } from './role-assignment.entity';
import { RoleEntity } from './role.entity';
import { SiteEntity } from './site.entity';
import { TransactionalOutboxEventEntity } from './transactional-outbox-event.entity';
import { ActivityDependencyEntity } from './activity-dependency.entity';
import { PackageEntity } from './package.entity';
import { ProgressUpdateEntity } from './progress-update.entity';
import { ProjectScheduleEntity } from './project-schedule.entity';
import { ScheduleActivityEntity } from './schedule-activity.entity';
import { ScheduleBaselineEntity } from './schedule-baseline.entity';
import { NotificationEntity } from './notification.entity';
import { WbsNodeEntity } from './wbs-node.entity';
import { ChangeRequestEntity } from './change-request.entity';
import { IssueEntity } from './issue.entity';
import { RiskEntity } from './risk.entity';
import { RiskIssueActionEntity } from './risk-issue-action.entity';
import { RiskIssueClosureCycleEntity } from './risk-issue-closure-cycle.entity';

export {
  AuditEventEntity, AuthenticationSessionEntity, LocalCredentialEntity,
  CommandReceiptEntity, CompanyEntity, EventConsumptionEntity,
  LegalEntityEntity, PortfolioEntity, ProjectEntity,
  ProjectPartyEntity, RoleAssignmentEntity, RoleEntity, SiteEntity,
  TenantEntity, TransactionalOutboxEventEntity, UserAccountEntity,
  ActivityDependencyEntity, PackageEntity, ProgressUpdateEntity,
  ProjectScheduleEntity, ScheduleActivityEntity, ScheduleBaselineEntity,
  NotificationEntity, NotificationEntity as ScheduleNotificationEntity, WbsNodeEntity,
  ChangeRequestEntity, IssueEntity, RiskEntity, RiskIssueActionEntity,
  RiskIssueClosureCycleEntity
};
export * from './operational.enums';
export * from './project-controls.enums';
export * from './project.enums';
export * from './risk-change.enums';

export const databaseEntities = [
  TenantEntity, UserAccountEntity, LocalCredentialEntity,
  AuthenticationSessionEntity, AuditEventEntity, CompanyEntity,
  LegalEntityEntity, RoleEntity, RoleAssignmentEntity, PortfolioEntity,
  ProjectEntity, SiteEntity, ProjectPartyEntity, TransactionalOutboxEventEntity,
  EventConsumptionEntity, CommandReceiptEntity, PackageEntity,
  ProjectScheduleEntity, WbsNodeEntity, ScheduleActivityEntity,
  ActivityDependencyEntity, ScheduleBaselineEntity, ProgressUpdateEntity,
  NotificationEntity, RiskEntity, IssueEntity, ChangeRequestEntity,
  RiskIssueActionEntity, RiskIssueClosureCycleEntity
];
