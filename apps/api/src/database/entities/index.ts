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
import { WorkflowDefinitionEntity } from './workflow-definition.entity';
import { WorkflowVersionEntity } from './workflow-version.entity';
import { WorkflowInstanceEntity } from './workflow-instance.entity';
import { ApprovalDecisionEntity } from './approval-decision.entity';
import { DocumentEntity } from './document.entity';
import { DocumentRevisionEntity } from './document-revision.entity';
import {
  DocumentExternalShareEntity, DocumentReviewCommentEntity, SignatureEnvelopeEntity,
  TransmittalEntity, TransmittalItemEntity
} from './document-collaboration.entity';
import { ContractEntity } from './contract.entity';
import {
  ContractAppendixEntity, ContractPartyEntity, ObligationEntity
} from './contract-collaboration.entity';
import {
  BudgetVersionEntity, CommitmentEntity, CostCodeEntity, FxSnapshotEntity, InvoiceEntity,
  PaymentComponentEntity, PaymentEntity
} from './cost-control.entity';
import { EquipmentModelEntity } from './equipment-model.entity';
import { BillOfMaterialsEntity, BomLineEntity } from './bill-of-materials.entity';
import {
  AssetEntity, BessPlantEntity, EquipmentEntity, SolarPlantEntity
} from './plant-asset.entity';

import {
  BidEntity, EvaluationEntity, RequisitionEntity, RfqEntity, SupplierProfileEntity
} from './procurement.entity';
import { PurchaseOrderEntity, PurchaseOrderLineEntity } from './purchase-order.entity';
import {
  GoodsReceiptEntity, InventoryTransactionEntity, SerialNumberEntity, ShipmentEntity,
  ShipmentMilestoneEntity
} from './logistics.entity';
import { OpportunityEntity } from './opportunity.entity';
import { SurveyPackageEntity } from './survey-package.entity';
import { InvestmentScenarioEntity } from './investment-scenario.entity';
import {
  DailyLogEntity, HseIncidentEntity, PermitToWorkEntity, QuantityProgressRecordEntity,
  StopWorkActionEntity, WorkfrontEntity
} from './field-operations.entity';
import {
  CapaActionEntity, InspectionEntity, InspectionTestPlanEntity, NcrDispositionCycleEntity,
  NcrEntity, PunchClosureCycleEntity, PunchItemEntity
} from './quality-control.entity';
import { DelegationEntity } from './delegation.entity';
import { SavedViewEntity } from './saved-view.entity';
import { ReportJobEntity } from './report-job.entity';
import {
  CommissioningSystemEntity, TestPackEntity, TestRunEntity
} from './commissioning.entity';
import {
  CodGateEntity, CodGateReviewCycleEntity, CodPackageEntity, HandoverEntity
} from './cod.entity';
import {
  AlarmCaseEntity, MaintenancePlanEntity, ServiceIncidentEntity, WarrantyClaimEntity,
  WorkOrderClosureCycleEntity, WorkOrderEntity
} from './operations-maintenance.entity';

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
  RiskIssueClosureCycleEntity, WorkflowDefinitionEntity, WorkflowVersionEntity,
  WorkflowInstanceEntity, ApprovalDecisionEntity, DocumentEntity, DocumentRevisionEntity,
  DocumentReviewCommentEntity, TransmittalEntity, TransmittalItemEntity,
  SignatureEnvelopeEntity, DocumentExternalShareEntity,
  ContractEntity, ContractPartyEntity, ContractAppendixEntity, ObligationEntity,
  CostCodeEntity, BudgetVersionEntity, CommitmentEntity, InvoiceEntity,
  PaymentEntity, PaymentComponentEntity, FxSnapshotEntity,
  EquipmentModelEntity, BillOfMaterialsEntity, BomLineEntity,
  EquipmentEntity, AssetEntity, SolarPlantEntity, BessPlantEntity,
  SupplierProfileEntity, RequisitionEntity, RfqEntity, BidEntity, EvaluationEntity,
  PurchaseOrderEntity, PurchaseOrderLineEntity, ShipmentEntity, ShipmentMilestoneEntity,
  GoodsReceiptEntity, InventoryTransactionEntity, SerialNumberEntity,
  OpportunityEntity, SurveyPackageEntity, InvestmentScenarioEntity,
  WorkfrontEntity, DailyLogEntity, QuantityProgressRecordEntity, PermitToWorkEntity,
  HseIncidentEntity, StopWorkActionEntity, InspectionTestPlanEntity, InspectionEntity,
  NcrEntity, NcrDispositionCycleEntity, PunchItemEntity, PunchClosureCycleEntity,
  CapaActionEntity, DelegationEntity, SavedViewEntity, ReportJobEntity,
  CommissioningSystemEntity, TestPackEntity, TestRunEntity, CodGateEntity,
  CodGateReviewCycleEntity, CodPackageEntity, HandoverEntity,
  AlarmCaseEntity, ServiceIncidentEntity, WorkOrderEntity, WorkOrderClosureCycleEntity,
  MaintenancePlanEntity, WarrantyClaimEntity
};
export * from './operational.enums';
export * from './project-controls.enums';
export * from './project.enums';
export * from './risk-change.enums';
export * from './workflow.enums';
export * from './document-control.enums';
export * from './contract-cost.enums';
export * from './procurement-logistics.enums';
export * from './opportunity.enums';
export * from './field-hse-quality.enums';
export * from './cross-cutting.enums';
export * from './commissioning-cod.enums';
export * from './operations-maintenance.enums';
export type { DelegationScopeSnapshot } from './delegation.entity';
export * from './engineering-plants.enums';
export type {
  WorkflowApproverSelector, WorkflowRoutingCondition, WorkflowRoutingRules, WorkflowRoutingStep
} from './workflow-version.entity';

export const databaseEntities = [
  TenantEntity, UserAccountEntity, LocalCredentialEntity,
  AuthenticationSessionEntity, AuditEventEntity, CompanyEntity,
  LegalEntityEntity, RoleEntity, RoleAssignmentEntity, PortfolioEntity,
  ProjectEntity, SiteEntity, ProjectPartyEntity, TransactionalOutboxEventEntity,
  EventConsumptionEntity, CommandReceiptEntity, PackageEntity,
  ProjectScheduleEntity, WbsNodeEntity, ScheduleActivityEntity,
  ActivityDependencyEntity, ScheduleBaselineEntity, ProgressUpdateEntity,
  NotificationEntity, RiskEntity, IssueEntity, ChangeRequestEntity,
  RiskIssueActionEntity, RiskIssueClosureCycleEntity, WorkflowDefinitionEntity,
  WorkflowVersionEntity, WorkflowInstanceEntity, ApprovalDecisionEntity,
  DocumentEntity, DocumentRevisionEntity, DocumentReviewCommentEntity,
  TransmittalEntity, TransmittalItemEntity, SignatureEnvelopeEntity,
  DocumentExternalShareEntity, ContractEntity, ContractPartyEntity,
  ContractAppendixEntity, ObligationEntity, CostCodeEntity, BudgetVersionEntity,
  CommitmentEntity, InvoiceEntity, PaymentEntity, PaymentComponentEntity,
  FxSnapshotEntity, EquipmentModelEntity, BillOfMaterialsEntity, BomLineEntity,
  EquipmentEntity, AssetEntity, SolarPlantEntity, BessPlantEntity,
  SupplierProfileEntity, RequisitionEntity, RfqEntity, BidEntity, EvaluationEntity,
  PurchaseOrderEntity, PurchaseOrderLineEntity, ShipmentEntity, ShipmentMilestoneEntity,
  GoodsReceiptEntity, InventoryTransactionEntity, SerialNumberEntity,
  OpportunityEntity, SurveyPackageEntity, InvestmentScenarioEntity,
  WorkfrontEntity, DailyLogEntity, QuantityProgressRecordEntity, PermitToWorkEntity,
  HseIncidentEntity, StopWorkActionEntity, InspectionTestPlanEntity, InspectionEntity,
  NcrEntity, NcrDispositionCycleEntity, PunchItemEntity, PunchClosureCycleEntity,
  CapaActionEntity, DelegationEntity, SavedViewEntity, ReportJobEntity,
  CommissioningSystemEntity, TestPackEntity, TestRunEntity, CodGateEntity,
  CodGateReviewCycleEntity, CodPackageEntity, HandoverEntity,
  AlarmCaseEntity, ServiceIncidentEntity, WorkOrderEntity, WorkOrderClosureCycleEntity,
  MaintenancePlanEntity, WarrantyClaimEntity
];
