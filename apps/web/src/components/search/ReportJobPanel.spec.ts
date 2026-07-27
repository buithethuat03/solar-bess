import { mount } from '@vue/test-utils';
import ReportJobPanel from './ReportJobPanel.vue';
import type { ReportJobView } from '@/types/search.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function job(overrides: Partial<ReportJobView> = {}): ReportJobView {
  return {
    id: 'job-1', reportType: 'RISK_REGISTER_CSV', filterSnapshot: { projectId: 'project-1' },
    status: 'QUEUED', dataAsOf: null, errorCode: null, expiresAt: null,
    requestedBy: 'analyst-user', correlationId: 'corr-1',
    createdAt: '2026-07-26T03:00:00.000Z', updatedAt: '2026-07-26T03:00:00.000Z',
    download: null, ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(ReportJobPanel, {
    props: { jobs: [job()], busy: false, canCreate: true, polling: false, ...overrides },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('ReportJobPanel — API-133/134', () => {
  /**
   * No S3 presigner is installed in this build, so a completed job resolves to a bucket/object
   * pair. Rendering that as a link would be a promise the build cannot keep: it would look like
   * the file is one click away and fail, or appear downloadable to someone whose permission was
   * revoked after the export ran.
   */
  it('renders a completed job as an object reference and never as a download link', () => {
    const wrapper = mountPanel({
      jobs: [job({
        status: 'COMPLETED',
        download: { bucket: 'reports', objectKey: 'tenant/report-jobs/job-1.csv' }
      })]
    });

    const reference = wrapper.get('[data-testid="report-object-ref"]');
    expect(reference.text()).toContain('reports');
    expect(reference.text()).toContain('tenant/report-jobs/job-1.csv');
    expect(reference.text()).toContain('không phải liên kết tải');
    // Nothing anchor-shaped, and nothing URL-shaped anywhere in the panel.
    expect(wrapper.findAll('a')).toHaveLength(0);
    expect(wrapper.html()).not.toMatch(/href=/);
    expect(wrapper.text()).not.toMatch(/https?:\/\//);
  });

  it('explains a completed job whose reference was withheld instead of showing an empty slot', () => {
    const wrapper = mountPanel({ jobs: [job({ status: 'COMPLETED', download: null })] });
    const note = wrapper.get('[data-testid="report-download-withheld"]').text();
    expect(note).toContain('quyền đọc register đã bị thu hồi');
    expect(note).toContain('thời hạn lưu trữ đã hết');
    expect(wrapper.find('[data-testid="report-object-ref"]').exists()).toBe(false);
  });

  it('marks a pending job as still running rather than as empty', () => {
    const wrapper = mountPanel({ jobs: [job({ status: 'RUNNING' })], polling: true });
    expect(wrapper.text()).toContain('Worker đang xử lý');
    expect(wrapper.text()).toContain('cập nhật tự động');
    expect(wrapper.get('li').attributes('data-status')).toBe('RUNNING');
  });

  it('names the failure code the server reported', () => {
    const wrapper = mountPanel({
      jobs: [job({ status: 'FAILED', errorCode: 'REGISTER_QUERY_FAILED' })]
    });
    expect(wrapper.text()).toContain('REGISTER_QUERY_FAILED');
  });

  it('emits a create with the report type and project the operator chose', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('form.search-inline-form');
    await form.get('select[aria-label="Loại báo cáo"]').setValue('DOCUMENT_REGISTER_CSV');
    await form.get('input').setValue('project-9');
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('create')?.[0]).toEqual([{
      reportType: 'DOCUMENT_REGISTER_CSV', projectId: 'project-9'
    }]);
  });

  it('refuses to queue a job without a project', async () => {
    const wrapper = mountPanel();
    await wrapper.get('form.search-inline-form').trigger('submit.prevent');
    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('Cần chỉ định dự án');
  });

  it('emits a refresh for the job the operator asked about', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button')
      .find((item) => item.text() === 'Cập nhật trạng thái')!.trigger('click');
    expect(wrapper.emitted('refresh')?.[0]).toEqual(['job-1']);
  });

  it('offers no create form without the permission', () => {
    const wrapper = mountPanel({ canCreate: false });
    expect(wrapper.find('form.search-inline-form').exists()).toBe(false);
    expect(wrapper.text()).toContain('report.create');
  });

  it('states that a report is not a sharing channel', () => {
    expect(mountPanel({ jobs: [] }).text()).toContain('không phải kênh chia sẻ');
  });
});
