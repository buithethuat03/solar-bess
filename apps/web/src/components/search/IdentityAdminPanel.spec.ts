import { mount } from '@vue/test-utils';
import IdentityAdminPanel from './IdentityAdminPanel.vue';
import type { AuditEventView, IdentityPermissionsData } from '@/types/search.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};

function identity(overrides: Partial<IdentityPermissionsData> = {}): IdentityPermissionsData {
  return {
    userId: 'user-1', tenantId: 'tenant-1', roles: ['PROJECT_MANAGER'],
    permissions: ['project.read', 'search.execute', 'audit.read'],
    scopes: [{
      roleCode: 'PROJECT_MANAGER', permissions: ['project.read'],
      scopeType: 'PROJECT', scopeId: 'project-1'
    }],
    policyVersion: 7, ...overrides
  };
}

function auditEvent(overrides: Partial<AuditEventView> = {}): AuditEventView {
  return {
    id: 'audit-1', actorId: 'user-1', action: 'WorkOrder.Closed', result: 'SUCCEEDED',
    reasonCode: null, objectType: 'WorkOrder', objectId: 'work-order-1',
    correlationId: 'corr-1', payload: null, occurredAt: '2026-07-26T04:00:00.000Z', ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(IdentityAdminPanel, {
    props: {
      identity: identity(), events: [auditEvent()], nextCursor: null, busy: false,
      canReadAudit: true, ...overrides
    },
    global: { stubs: { ElButton: buttonStub } }
  });
}

describe('IdentityAdminPanel — API-002/013', () => {
  it('names the policy version behind the effective permission answer', () => {
    const facts = mountPanel().get('[data-testid="identity-facts"]').text();
    expect(facts).toContain('PROJECT_MANAGER');
    expect(facts).toContain('7');
  });

  it('reports a user with no roles as having none rather than showing a blank', () => {
    const wrapper = mountPanel({
      identity: identity({ roles: [], permissions: [], scopes: [], policyVersion: 0 })
    });
    expect(wrapper.get('[data-testid="identity-facts"]').text()).toContain('Không có vai trò');
  });

  it('emits the audit filters that were actually filled in', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('form.search-inline-form');
    await form.findAll('input')[0].setValue('WorkOrder');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('filter')?.[0]).toEqual([{ objectType: 'WorkOrder' }]);
  });

  it('renders the audit trail with its correlation id for reproducibility', () => {
    const wrapper = mountPanel();
    expect(wrapper.get('tbody').text()).toContain('WorkOrder.Closed');
    expect(wrapper.get('tbody').text()).toContain('corr-1');
    expect(wrapper.get('tbody .status-pill').attributes('data-status')).toBe('SUCCEEDED');
  });

  it('marks a failed audit row so it survives a greyscale print', () => {
    const wrapper = mountPanel({ events: [auditEvent({ result: 'FAILED' })] });
    expect(wrapper.get('tbody tr').attributes('data-result')).toBe('FAILED');
  });

  it('states the missing permission instead of rendering an empty audit table', () => {
    const wrapper = mountPanel({ canReadAudit: false, events: [] });
    expect(wrapper.text()).toContain('audit.read');
    expect(wrapper.find('tbody').exists()).toBe(false);
  });

  it('offers cursor pagination only when the server returned a cursor', async () => {
    expect(mountPanel().findAll('button').some((item) => item.text() === 'Tải thêm audit event'))
      .toBe(false);
    const paged = mountPanel({ nextCursor: 'opaque' });
    await paged.findAll('button')
      .find((item) => item.text() === 'Tải thêm audit event')!.trigger('click');
    expect(paged.emitted('more')).toHaveLength(1);
  });
});
