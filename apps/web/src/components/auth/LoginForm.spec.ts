import { mount } from '@vue/test-utils';
import LoginForm from './LoginForm.vue';

const stubs = {
  ElAlert: { props: ['title'], template: '<div class="alert">{{ title }}</div>' },
  // Forward the native event: the component listens with `@submit.prevent`, whose modifier calls
  // preventDefault on whatever argument it receives.
  ElForm: { template: '<form @submit="$emit(\'submit\', $event)"><slot /></form>' },
  ElFormItem: { template: '<label><slot /></label>' },
  ElInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  ElButton: { template: '<button type="submit"><slot /></button>' }
};

function mountForm(error = '') {
  return mount(LoginForm, { props: { loading: false, error }, global: { stubs } });
}

async function fill(wrapper: ReturnType<typeof mountForm>, tenant: string, email: string, password: string) {
  const inputs = wrapper.findAll('input');
  await inputs[0].setValue(tenant);
  await inputs[1].setValue(email);
  await inputs[2].setValue(password);
  await wrapper.get('form').trigger('submit');
}

describe('LoginForm — TEST-230/231', () => {
  it('rejects a malformed email locally instead of round-tripping a generic failure', async () => {
    const wrapper = mountForm();
    await fill(wrapper, 'demo', 'not-an-email', 'LongEnoughPassword');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.get('.alert').text()).toBe('Email không đúng định dạng.');
  });

  it('rejects a password shorter than the server minimum', async () => {
    const wrapper = mountForm();
    await fill(wrapper, 'demo', 'user@example.test', 'short');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.get('.alert').text()).toBe('Mật khẩu phải có ít nhất 8 ký tự.');
  });

  it('requires a tenant code', async () => {
    const wrapper = mountForm();
    await fill(wrapper, '   ', 'user@example.test', 'LongEnoughPassword');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.get('.alert').text()).toBe('Vui lòng nhập mã tenant.');
  });

  it('submits trimmed credentials once the form is valid', async () => {
    const wrapper = mountForm();
    await fill(wrapper, ' demo ', ' user@example.test ', 'LongEnoughPassword');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      tenantCode: 'demo', email: 'user@example.test', password: 'LongEnoughPassword'
    });
  });

  it('shows the server error when there is no local complaint', () => {
    expect(mountForm('Thông tin đăng nhập không hợp lệ').get('.alert').text())
      .toBe('Thông tin đăng nhập không hợp lệ');
  });

  it('prefers the local complaint so the two messages cannot contradict', async () => {
    const wrapper = mountForm('Thông tin đăng nhập không hợp lệ');
    await fill(wrapper, 'demo', 'bad', 'LongEnoughPassword');
    expect(wrapper.get('.alert').text()).toBe('Email không đúng định dạng.');
  });
});
