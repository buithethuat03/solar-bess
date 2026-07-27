import { mount } from '@vue/test-utils';
import AssetPerformancePanel from './AssetPerformancePanel.vue';
import type { AssetPerformanceData } from '@/types/operations.types';

function performance(overrides: Partial<AssetPerformanceData> = {}): AssetPerformanceData {
  return {
    asset: {
      id: 'asset-1', projectId: 'project-1', siteId: 'site-1', equipmentId: null,
      assetCode: 'INV-03', operationalStatus: 'IN_SERVICE', activationDate: '2026-01-15'
    },
    workOrderCountsByStatus: { CLOSED: 4, IN_PROGRESS: 1 },
    serviceIncidentCountsByStatus: { OPEN: 2 },
    alarmCaseCountsByState: { ACKNOWLEDGED: 3 },
    kpi: null,
    telemetry: null,
    ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(AssetPerformancePanel, {
    props: { performance: performance(), permitted: true, ...overrides }
  });
}

describe('AssetPerformancePanel — API-121', () => {
  /**
   * The load-bearing test of this slice. API-121 answers `kpi: null` / `telemetry: null` because
   * PM Web has no telemetry store, and a zero would turn "we cannot measure this" into "we
   * measured zero" — the same mistake a dash or an empty chart makes in a different font.
   */
  it('states that no measurement source exists instead of rendering a zero, a dash or a chart', () => {
    const wrapper = mountPanel();

    for (const testId of ['asset-kpi', 'asset-telemetry']) {
      const block = wrapper.get(`[data-testid="${testId}"]`);
      expect(block.text()).toContain('Chưa có nguồn đo');
      // No number at all, in particular not a 0 standing in for a reading.
      expect(block.text()).not.toMatch(/\d/);
      // No em dash, en dash or hyphen placeholder pretending to be an unavailable value.
      expect(block.text()).not.toMatch(/[—–]/);
      // And nothing chart-shaped: an empty axis reads as a flat measurement.
      expect(block.findAll('svg, canvas, .chart, [role="img"]')).toHaveLength(0);
    }
  });

  it('renders only the statuses that actually have rows and never backfills a zero', () => {
    const wrapper = mountPanel({
      performance: performance({
        workOrderCountsByStatus: { CLOSED: 4 },
        serviceIncidentCountsByStatus: {},
        alarmCaseCountsByState: {}
      })
    });
    const counts = wrapper.get('[data-testid="asset-counts"]');

    expect(counts.text()).toContain('CLOSED');
    expect(counts.text()).toContain('4');
    // Statuses with no rows are absent, not zeroed: the register never claims a count it lacks.
    expect(counts.text()).not.toContain('DRAFT');
    expect(counts.text()).toContain('Asset chưa có sự cố dịch vụ nào được ghi nhận.');
    expect(counts.text()).toContain('Asset chưa có alarm case cục bộ nào được ghi nhận.');
  });

  it('reports a missing performance permission rather than an empty panel', () => {
    const wrapper = mountPanel({ performance: null, permitted: false });
    expect(wrapper.text()).toContain('performance.read');
    expect(wrapper.find('[data-testid="asset-kpi"]').exists()).toBe(false);
  });

  it('names the asset identity the API actually proved', () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain('INV-03');
    expect(wrapper.text()).toContain('IN_SERVICE');
  });
});
