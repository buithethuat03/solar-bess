import { mount } from '@vue/test-utils';
import ServiceIncidentPanel from './ServiceIncidentPanel.vue';
import type { ServiceIncidentView } from '@/types/operations.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function incident(overrides: Partial<ServiceIncidentView> = {}): ServiceIncidentView {
  return {
    id: 'incident-1', projectId: 'project-1', siteId: 'site-1', assetId: 'asset-1',
    alarmCaseId: null, hseIncidentId: null, severity: 'HIGH', status: 'OPEN',
    title: 'Inverter 3 ngắt kết nối', description: null,
    detectedAt: '2026-07-26T02:15:00.000Z', downtimeStart: null, downtimeEnd: null,
    slaResponseDueAt: null, slaRespondedAt: null, slaResolutionDueAt: null, slaResolvedAt: null,
    resolutionSummary: null, reportedBy: 'operator-user', versionNo: 1,
    createdBy: 'operator-user', updatedBy: 'operator-user',
    createdAt: '2026-07-26T02:20:00.000Z', updatedAt: '2026-07-26T02:20:00.000Z', ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(ServiceIncidentPanel, {
    props: {
      incidents: [incident()], alarmCases: [], assetId: 'asset-1', nextCursor: null,
      busy: false, canCreate: true, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

async function openForm(wrapper: ReturnType<typeof mountPanel>) {
  await wrapper.findAll('button').find((item) => item.text() === 'Mở sự cố')!.trigger('click');
  return wrapper.get('form.operations-inline-form');
}

describe('ServiceIncidentPanel — API-116/117', () => {
  it('emits a create with the detection time normalised to ISO-8601', async () => {
    const wrapper = mountPanel();
    const form = await openForm(wrapper);
    await form.get('input[type="datetime-local"]').setValue('2026-07-26T09:15');
    await form.get('input:not([type])').setValue('Inverter 3 ngắt kết nối');
    await form.trigger('submit.prevent');

    const emitted = wrapper.emitted('create')?.[0]?.[0] as Record<string, unknown>;
    expect(emitted.title).toBe('Inverter 3 ngắt kết nối');
    expect(emitted.severity).toBe('MEDIUM');
    expect(String(emitted.detectedAt)).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    // The asset in view is linked by default because that is what the operator is looking at.
    expect(emitted.assetId).toBe('asset-1');
  });

  it('refuses a downtime end without a start rather than letting the API answer 422', async () => {
    const wrapper = mountPanel();
    const form = await openForm(wrapper);
    const times = form.findAll('input[type="datetime-local"]');
    await times[0].setValue('2026-07-26T09:15');
    await form.get('input:not([type])').setValue('Inverter 3 ngắt kết nối');
    // times: detectedAt, downtimeStart, downtimeEnd, slaResponse, slaResolution
    await times[2].setValue('2026-07-26T11:00');
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('bắt đầu gián đoạn');
  });

  it('refuses a downtime window that ends before it starts', async () => {
    const wrapper = mountPanel();
    const form = await openForm(wrapper);
    const times = form.findAll('input[type="datetime-local"]');
    await times[0].setValue('2026-07-26T09:15');
    await form.get('input:not([type])').setValue('Inverter 3 ngắt kết nối');
    await times[1].setValue('2026-07-26T11:00');
    await times[2].setValue('2026-07-26T10:00');
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('phải sau thời điểm bắt đầu');
  });

  it('reports an undeclared downtime window and SLA clock as unset, not as zero', () => {
    const text = mountPanel().get('tbody').text();
    expect(text).toContain('Chưa khai báo');
    expect(text).toContain('chưa đặt');
    expect(text).not.toMatch(/\b0 phút\b/);
  });

  it('offers no create control without the permission', () => {
    const wrapper = mountPanel({ canCreate: false });
    expect(wrapper.findAll('button').map((item) => item.text())).not.toContain('Mở sự cố');
  });

  it('gives every select an explicit aria-label', async () => {
    const wrapper = mountPanel();
    const form = await openForm(wrapper);
    const selects = form.findAll('select');
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) {
      expect(select.attributes('aria-label')).toBeTruthy();
    }
  });
});
