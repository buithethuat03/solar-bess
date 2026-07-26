import { mount } from '@vue/test-utils';
import ContractDetailPanel from './ContractDetailPanel.vue';
import type {
  ContractAppendixView, ContractDetailView, ContractPartyView
} from '@/types/contract.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function contract(overrides: Partial<ContractDetailView> = {}): ContractDetailView {
  return {
    id: 'contract-1', projectId: 'project-1', contractNo: 'EPC-2026-001',
    title: 'Gói EPC nhà máy 50MWp', type: 'EPC', status: 'DRAFT',
    effectiveFrom: '2026-08-01', effectiveTo: null,
    value: '1000000000', consolidatedValue: '997500000.5', currency: 'VND',
    rootDocumentId: null, legalHold: false, signedAt: null, signedBy: null, versionNo: 3,
    createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T10:00:00.000Z',
    updatedAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

function party(overrides: Partial<ContractPartyView> = {}): ContractPartyView {
  return {
    id: 'party-1', contractId: 'contract-1', projectId: 'project-1', companyId: 'company-1',
    legalEntityId: 'legal-1', partyRole: 'OWNER', legalNameSnapshot: 'Công ty CP Điện Mặt Trời X',
    countrySnapshot: 'VN', registrationNoSnapshot: '0100000000', taxIdSnapshot: '0100000000-001',
    representativeName: 'Nguyễn Văn A', representativeTitle: 'Tổng giám đốc',
    authorityReference: null, snapshotAt: '2026-07-26T10:00:00.000Z', snapshotHash: 'hash',
    createdBy: 'user-1', createdAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

function appendix(overrides: Partial<ContractAppendixView> = {}): ContractAppendixView {
  return {
    id: 'appendix-1', contractId: 'contract-1', projectId: 'project-1', appendixNo: 'PL-01',
    revisionNo: 1, type: 'AMENDMENT', effectiveDate: '2026-09-01', valueImpact: '-2499999.5',
    currency: 'VND', documentId: null, status: 'EFFECTIVE', versionNo: 1, createdBy: 'user-1',
    updatedBy: 'user-1', createdAt: '2026-07-26T10:00:00.000Z',
    updatedAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

const companies = [{
  id: 'company-1', code: 'CTY1', name: 'Công ty X',
  organizationType: 'CUSTOMER' as const, status: 'ACTIVE'
}];
const legalEntities = [{
  id: 'legal-1', companyId: 'company-1', legalName: 'Công ty CP Điện Mặt Trời X',
  country: 'VN', registrationNo: '0100000000', taxId: null, status: 'ACTIVE'
}];

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(ContractDetailPanel, {
    props: {
      contract: contract(), parties: [party()], appendices: [appendix()],
      companies, legalEntities, busy: false,
      permissions: { update: true, addParty: true, addAppendix: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('ContractDetailPanel — API-055…058', () => {
  it('displays the Postgres-consolidated value as "giá trị hợp nhất" with its currency', () => {
    const wrapper = mountPanel();
    const block = wrapper.get('.contract-consolidated');
    expect(block.text()).toContain('Giá trị hợp nhất');
    // Grouped for reading, digits untouched, currency named right next to the number.
    expect(block.findAll('.money')[0].text().replace(/\u202F/g, '')).toBe('997500000.5 VND');
    expect(block.findAll('.money')[1].text().replace(/\u202F/g, '')).toBe('1000000000 VND');
  });

  it('names the signed-family status but renders no sign or activate action', () => {
    const wrapper = mountPanel({
      contract: contract({ status: 'SIGNED' }),
      permissions: { update: true, addParty: true, addAppendix: true }
    });
    expect(wrapper.get('.detail-heading .status-pill').text()).toBe('Đã ký');
    // V1 honesty: the catalog has no transition operation, so no button may promise one.
    const labels = wrapper.findAll('button').map((button) => button.text());
    expect(labels).toEqual(['Đóng', 'Thêm bên tham gia', 'Thêm phụ lục']);
    // And the DRAFT-only edit form is gone for a signed contract.
    expect(wrapper.find('.contract-edit').exists()).toBe(false);
  });

  it('gates the draft edit form on permission, DRAFT status and no legal hold', () => {
    expect(mountPanel().find('.contract-edit').exists()).toBe(true);
    expect(mountPanel({
      permissions: { update: false, addParty: true, addAppendix: true }
    }).find('.contract-edit').exists()).toBe(false);
    expect(mountPanel({ contract: contract({ legalHold: true }) })
      .find('.contract-edit').exists()).toBe(false);
  });

  it('emits the draft update with the displayed version for optimistic concurrency', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('.contract-edit form');
    await form.findAll('input')[0].setValue('Gói EPC điều chỉnh');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('update')?.[0]).toEqual([{
      expectedVersion: 3, title: 'Gói EPC điều chỉnh', type: 'EPC',
      value: '1000000000', currency: 'VND', effectiveFrom: '2026-08-01'
    }]);
  });

  it('hides the party and appendix forms without their create permissions', () => {
    const wrapper = mountPanel({
      permissions: { update: false, addParty: false, addAppendix: false }
    });
    const labels = wrapper.findAll('button').map((button) => button.text());
    expect(labels).not.toContain('Thêm bên tham gia');
    expect(labels).not.toContain('Thêm phụ lục');
    // The read-side snapshot still renders — gating hides commands, not history.
    expect(wrapper.text()).toContain('Công ty CP Điện Mặt Trời X');
  });

  it('emits add-party from the master-data selects', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button').find((item) => item.text() === 'Thêm bên tham gia')!.trigger('click');
    const form = wrapper.get('form.contract-inline-form');
    await form.get('select[aria-label="Company"]').setValue('company-1');
    await form.get('select[aria-label="Pháp nhân"]').setValue('legal-1');
    await form.get('select[aria-label="Vai trò bên tham gia"]').setValue('EPC');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('add-party')?.[0]).toEqual([{
      companyId: 'company-1', legalEntityId: 'legal-1', partyRole: 'EPC'
    }]);
  });

  it('blocks an EFFECTIVE appendix without its effective date before it reaches the API', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button').find((item) => item.text() === 'Thêm phụ lục')!.trigger('click');
    const form = wrapper.get('form.contract-inline-form');
    await form.findAll('input')[0].setValue('PL-02');
    await form.get('select[aria-label="Trạng thái phụ lục"]').setValue('EFFECTIVE');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('add-appendix')).toBeUndefined();
    expect(wrapper.text()).toContain('Phụ lục EFFECTIVE cần ngày hiệu lực');
  });

  it('renders each appendix impact as signed text in the contract currency', () => {
    const wrapper = mountPanel();
    const impact = wrapper.findAll('tbody .money').at(-1)!;
    expect(impact.text().replace(/\u202F/g, '')).toBe('-2499999.5 VND');
    expect(wrapper.text()).toContain('Phụ lục sửa đổi');
  });
});
