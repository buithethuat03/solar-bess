import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('frontend project structure — ADR-001/ADR-003', () => {
  it.each(['app', 'api', 'components/common', 'components/projects', 'components/schedule', 'components/risk-change', 'layouts', 'router', 'stores', 'styles', 'types', 'views/projects', 'views/schedule', 'views/risk-change',
    'components/notification', 'views/notification', 'components/auth',
    'components/workflow', 'views/workflow', 'components/documents', 'views/documents',
    'components/contracts', 'views/contracts',
    'components/field-operations', 'views/field-operations',
    'components/quality', 'views/quality',
    'components/procurement', 'views/procurement',
    'components/commissioning', 'views/commissioning',
    'components/operations', 'views/operations',
    'components/opportunity', 'views/opportunity',
    'components/search', 'views/search'])(
    'contains src/%s',
    (directory) => expect(existsSync(join(process.cwd(), 'src', directory))).toBe(true)
  );

  it('keeps transport calls out of stores, views and shared components', () => {
    for (const file of [
      'src/stores/auth.store.ts',
      'src/views/auth/LoginView.vue',
      'src/views/dashboard/DashboardView.vue',
      'src/views/projects/ProjectListView.vue',
      'src/views/projects/ProjectCreateView.vue',
      'src/views/projects/ProjectDetailView.vue',
      'src/views/schedule/ProjectScheduleView.vue',
      'src/views/risk-change/ProjectRiskChangeView.vue',
      'src/views/notification/NotificationInboxView.vue',
      'src/components/notification/NotificationInbox.vue',
      'src/views/workflow/ApprovalInboxView.vue',
      'src/components/workflow/ApprovalTaskList.vue',
      'src/views/documents/ProjectDocumentsView.vue',
      'src/components/documents/DocumentRegisterTable.vue',
      'src/components/documents/DocumentUploadPanel.vue',
      'src/views/contracts/ProjectContractsView.vue',
      'src/views/field-operations/ProjectFieldOperationsView.vue',
      'src/views/quality/ProjectQualityView.vue',
      'src/views/procurement/ProjectProcurementView.vue',
      'src/views/commissioning/ProjectCommissioningView.vue',
      'src/views/operations/AssetOperationsView.vue',
      'src/views/opportunity/OpportunityListView.vue',
      'src/views/search/GlobalSearchView.vue',
      'src/components/field-operations/DailyLogPanel.vue',
      'src/components/field-operations/HseIncidentForm.vue',
      'src/components/field-operations/PermitToWorkPanel.vue',
      'src/components/field-operations/QuantityLedgerPanel.vue',
      'src/components/field-operations/StopWorkBanner.vue',
      'src/components/field-operations/StopWorkPanel.vue',
      'src/components/field-operations/WorkfrontRegisterTable.vue',
      'src/components/quality/InspectionPanel.vue',
      'src/components/quality/NcrRegisterPanel.vue',
      'src/components/quality/PunchListPanel.vue',
      'src/components/procurement/BidEvaluationPanel.vue',
      'src/components/procurement/LogisticsPanel.vue',
      'src/components/procurement/PurchaseOrderPanel.vue',
      'src/components/procurement/SourcingPanel.vue',
      'src/components/procurement/SupplierRegisterTable.vue',
      'src/components/commissioning/CodReadinessBoard.vue',
      'src/components/commissioning/CommissioningSystemTree.vue',
      'src/components/commissioning/TestPackPanel.vue',
      'src/components/commissioning/TestRunPanel.vue',
      'src/components/operations/AlarmCaseList.vue',
      'src/components/operations/AssetPerformancePanel.vue',
      'src/components/operations/ServiceIncidentPanel.vue',
      'src/components/operations/WorkOrderCommandPanel.vue',
      'src/components/operations/WorkOrderCreateForm.vue',
      'src/components/operations/WorkOrderRegisterTable.vue',
      'src/components/opportunity/InvestmentScenarioPanel.vue',
      'src/components/opportunity/OpportunityCreateForm.vue',
      'src/components/opportunity/OpportunityDetailPanel.vue',
      'src/components/opportunity/OpportunityPipeline.vue',
      'src/components/search/IdentityAdminPanel.vue',
      'src/components/search/ReportJobPanel.vue',
      'src/components/search/SavedViewPanel.vue',
      'src/components/search/SearchResultList.vue',
      'src/components/contracts/ContractRegisterTable.vue',
      'src/components/contracts/ContractDetailPanel.vue',
      'src/components/contracts/ObligationPanel.vue',
      'src/components/contracts/CostSummaryPanel.vue',
      'src/components/projects/ProjectForm.vue',
      'src/components/schedule/ScheduleGantt.vue',
      'src/components/risk-change/RiskHeatmap.vue',
      'src/components/common/AppHeader.vue'
    ]) {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).not.toContain('fetch(');
    }
  });

  it('keeps one API module per backend feature module', () => {
    expect(existsSync(join(process.cwd(), 'src/api/auth.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/project.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/schedule.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/risk-change.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/user.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/notification.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/workflow.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/document.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/contract.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/field-hse.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/procurement.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/commissioning.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/operations.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/opportunity.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/search.api.ts'))).toBe(true);
  });
});
