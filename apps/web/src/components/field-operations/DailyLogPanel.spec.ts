import { mount } from '@vue/test-utils';
import DailyLogPanel from './DailyLogPanel.vue';
import type { DailyLogView } from '@/types/field-hse.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'plain', 'disabled'], emits: ['click'],
  template: '<button :type="$attrs[\'native-type\'] || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title', 'type'], template: '<div class="alert">{{ title }}</div>' };

const sites = [{
  id: 'site-1', projectId: 'project-1', code: 'ST-01', name: 'Khu A', location: null,
  timezone: 'Asia/Ho_Chi_Minh', isPrimary: true, status: 'ACTIVE'
}];
const companies = [{
  id: 'company-1', code: 'EPC-1', name: 'Nhà thầu EPC A',
  organizationType: 'CONTRACTOR' as const, status: 'ACTIVE'
}];

function log(overrides: Partial<DailyLogView> = {}): DailyLogView {
  return {
    id: 'log-1', projectId: 'project-1', siteId: 'site-1', contractorCompanyId: 'company-1',
    logDate: '2026-07-25', shift: 'DAY', revision: 1, status: 'SIGNED',
    summary: 'Lắp đặt 120 module dãy 3', details: {}, correctionOfId: null, reason: null,
    signerSnapshot: { userId: 'user-1' }, signedBy: 'user-1',
    signedAt: '2026-07-25T12:00:00.000Z', versionNo: 3, createdBy: 'user-1',
    updatedBy: 'user-1', createdAt: '2026-07-25T10:00:00.000Z',
    updatedAt: '2026-07-25T12:00:00.000Z', ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(DailyLogPanel, {
    props: {
      logs: [log()], sites, companies, busy: false,
      permissions: { create: true, submit: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

function labelled(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((item) => item.text() === text);
}

describe('DailyLogPanel — API-088/089', () => {
  /** FR-080: an amendment without a stated reason is a rewrite, and the row constraint refuses it. */
  it('refuses a correction with no reason before it reaches the server', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Đính chính')!.trigger('click');
    await wrapper.findAll('form').at(-1)!.trigger('submit');

    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('Đính chính bắt buộc phải có lý do');
  });

  it('emits a correction as a new revision of the same slot, never an edit', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Đính chính')!.trigger('click');
    const form = wrapper.findAll('form').at(-1)!;
    expect(form.text()).toContain('bản đã ký được giữ nguyên và chuyển sang SUPERSEDED');
    await form.findAll('textarea')[0].setValue('Lắp đặt 118 module dãy 3');
    await form.findAll('textarea')[1].setValue('Đếm lại số module thực lắp');
    await form.trigger('submit');

    expect(wrapper.emitted('create')?.[0]?.[0]).toEqual({
      siteId: 'site-1', contractorCompanyId: 'company-1', logDate: '2026-07-25', shift: 'DAY',
      summary: 'Lắp đặt 118 module dãy 3', correctionOfId: 'log-1',
      reason: 'Đếm lại số module thực lắp'
    });
  });

  it('offers submit for DRAFT, sign for SUBMITTED and correction only for SIGNED', () => {
    const draft = mountPanel({ logs: [log({ status: 'DRAFT', signedAt: null, signedBy: null, signerSnapshot: null })] });
    expect(labelled(draft, 'Trình')).toBeDefined();
    expect(labelled(draft, 'Đính chính')).toBeUndefined();

    const submitted = mountPanel({ logs: [log({ status: 'SUBMITTED', signedAt: null, signedBy: null, signerSnapshot: null })] });
    expect(labelled(submitted, 'Ký')).toBeDefined();

    const signed = mountPanel();
    expect(labelled(signed, 'Đính chính')).toBeDefined();
    expect(labelled(signed, 'Trình')).toBeUndefined();
  });

  it('sends the submit command with the row version', async () => {
    const wrapper = mountPanel({
      logs: [log({ status: 'DRAFT', versionNo: 1, signedAt: null, signedBy: null, signerSnapshot: null })]
    });
    await labelled(wrapper, 'Trình')!.trigger('click');
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      'log-1', { expectedVersion: 1, action: 'SUBMIT' }
    ]);
  });

  it('keeps a superseded revision visible beside its correction', () => {
    const wrapper = mountPanel({
      logs: [
        log({ id: 'log-2', revision: 2, status: 'DRAFT', correctionOfId: 'log-1', reason: 'Đếm lại', signedAt: null, signedBy: null, signerSnapshot: null }),
        log({ status: 'SUPERSEDED' })
      ]
    });
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('rev 2');
    expect(rows[0].text()).toContain('Đính chính · Đếm lại');
    expect(rows[1].attributes('data-status')).toBe('SUPERSEDED');
  });

  it('labels every select for the accessible-name based E2E suite', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Tạo nhật ký')!.trigger('click');
    expect(wrapper.findAll('select').map((item) => item.attributes('aria-label')))
      .toEqual(['Công trường nhật ký', 'Nhà thầu nhật ký', 'Ca làm việc']);
  });
});
