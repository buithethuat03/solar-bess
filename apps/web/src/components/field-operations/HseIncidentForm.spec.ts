import { mount } from '@vue/test-utils';
import HseIncidentForm from './HseIncidentForm.vue';

const buttonStub = {
  props: ['loading', 'type', 'disabled'], emits: ['click'],
  template: '<button :type="$attrs[\'native-type\'] || \'button\'" :disabled="disabled || loading"><slot /></button>'
};
const alertStub = { props: ['title', 'type'], template: '<div class="alert">{{ title }}</div>' };

const sites = [{
  id: 'site-1', projectId: 'project-1', code: 'ST-01', name: 'Khu A', location: null,
  timezone: 'Asia/Ho_Chi_Minh', isPrimary: true, status: 'ACTIVE'
}];

function mountForm(overrides: Record<string, unknown> = {}) {
  return mount(HseIncidentForm, {
    props: {
      sites, stopWorkActive: false, submitting: false, lastReported: null, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

function submitButton(wrapper: ReturnType<typeof mountForm>) {
  return wrapper.findAll('button').find((item) => item.text() === 'Gửi báo cáo sự cố')!;
}

/** `datetime-local` value for an instant the API will accept as already past. */
function localInput(offsetMs: number): string {
  const at = new Date(Date.now() + offsetMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
    + `T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

describe('HseIncidentForm — API-093 / SEC-130', () => {
  /**
   * The single most important property of this screen: API-093 is never gated on aggregate state, so
   * neither is the form. A stop-work covering the whole project changes nothing here.
   */
  it('stays reachable and enabled while a stop-work is standing', () => {
    const wrapper = mountForm({ stopWorkActive: true });
    expect(wrapper.find('form').exists()).toBe(true);
    expect(submitButton(wrapper).attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('biểu mẫu này vẫn hoạt động bình thường');
  });

  it.each([[true], [false]])(
    'leaves every control enabled with stopWorkActive=%s',
    (stopWorkActive) => {
      const wrapper = mountForm({ stopWorkActive });
      expect(wrapper.find('form').exists()).toBe(true);
      expect(wrapper.findAll('[disabled]')).toHaveLength(0);
    }
  );

  it('emits the report with the enum classification and an ISO instant', async () => {
    const wrapper = mountForm();
    await wrapper.get('input[type="datetime-local"]').setValue(localInput(-3_600_000));
    await wrapper.findAll('select')[1].setValue('LOST_TIME');
    await wrapper.findAll('select')[2].setValue('HIGH');
    await wrapper.findAll('select')[3].setValue('CRITICAL');
    await wrapper.get('textarea').setValue('Công nhân trượt ngã khi lắp module');
    await wrapper.get('form').trigger('submit');

    const reported = wrapper.emitted('report')?.[0]?.[0] as Record<string, unknown>;
    expect(reported).toMatchObject({
      incidentType: 'LOST_TIME', actualSeverity: 'HIGH', potentialSeverity: 'CRITICAL',
      narrative: 'Công nhân trượt ngã khi lắp module'
    });
    expect(String(reported.occurredAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('refuses a future occurrence locally instead of spending a round trip', async () => {
    const wrapper = mountForm();
    await wrapper.get('input[type="datetime-local"]').setValue(localInput(86_400_000));
    await wrapper.get('textarea').setValue('Sự kiện chưa xảy ra');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('report')).toBeUndefined();
    expect(wrapper.text()).toContain('Thời điểm xảy ra sự cố không thể ở tương lai.');
  });

  /** SEC-130: the column exists but never leaves the row, so nothing here collects or shows it. */
  it('neither collects nor displays restricted facts', () => {
    const wrapper = mountForm({
      lastReported: {
        id: 'incident-1', projectId: 'project-1', siteId: 'site-1',
        occurredAt: '2026-07-26T02:00:00.000Z', reportedAt: '2026-07-26T02:30:00.000Z',
        reportedBy: 'user-1', incidentType: 'NEAR_MISS', actualSeverity: 'LOW',
        potentialSeverity: 'HIGH', narrative: 'Vật rơi gần khu lắp đặt', immediateAction: null,
        legalHold: false, status: 'REPORTED', closedBy: null, closedAt: null, versionNo: 1,
        createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T02:30:00.000Z',
        updatedAt: '2026-07-26T02:30:00.000Z'
      }
    });
    // No control collects them…
    expect(wrapper.get('form').html().toLowerCase()).not.toContain('restricted');
    // …and the receipt renders only what the API view actually returns.
    expect(wrapper.get('.hse-incident-receipt').text()).toContain('Vật rơi gần khu lắp đặt');
    expect(wrapper.text()).toContain('API không trả về restricted facts (SEC-130)');
  });

  it('labels every select for the accessible-name based E2E suite', () => {
    const wrapper = mountForm();
    const labels = wrapper.findAll('select').map((item) => item.attributes('aria-label'));
    expect(labels).toEqual([
      'Công trường xảy ra sự cố', 'Loại sự cố', 'Mức độ thực tế', 'Mức độ tiềm ẩn'
    ]);
  });
});
