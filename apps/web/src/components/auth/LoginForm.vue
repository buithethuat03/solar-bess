<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { LoginInput } from '@/types/auth.types';

const props = defineProps<{ loading: boolean; error: string }>();
const emit = defineEmits<{ submit: [input: LoginInput] }>();
const form = reactive<LoginInput>({ tenantCode: 'demo', email: '', password: '' });
const localError = ref('');

// Shown instead of the server error while the user is fixing an obviously invalid form, so the two
// never contradict each other.
const visibleError = computed(() => localError.value || props.error);

function submit(): void {
  const tenantCode = form.tenantCode.trim();
  const email = form.email.trim();
  if (!tenantCode) {
    localError.value = 'Vui lòng nhập mã tenant.';
    return;
  }
  // Mirrors the server contract (IsEmail + MinLength 8) so a rejected form is caught before the
  // round trip rather than coming back as a generic failure.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    localError.value = 'Email không đúng định dạng.';
    return;
  }
  if (form.password.length < 8) {
    localError.value = 'Mật khẩu phải có ít nhất 8 ký tự.';
    return;
  }
  localError.value = '';
  emit('submit', { tenantCode, email, password: form.password });
}
</script>

<template>
  <div class="login-card">
    <p class="eyebrow eyebrow--accent">SOLAR &amp; BESS</p>
    <h2>Đăng nhập nền tảng</h2>
    <p class="muted">Sử dụng tài khoản test được cấp cho tenant của bạn.</p>
    <el-alert v-if="visibleError" :title="visibleError" type="error" :closable="false" show-icon />
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="Mã tenant">
        <el-input v-model="form.tenantCode" name="tenantCode" autocomplete="organization" />
      </el-form-item>
      <el-form-item label="Email">
        <el-input
          v-model="form.email"
          name="email"
          type="email"
          autocomplete="username"
          placeholder="ten@congty.com"
        />
      </el-form-item>
      <el-form-item label="Mật khẩu">
        <el-input
          v-model="form.password"
          name="password"
          type="password"
          autocomplete="current-password"
          show-password
          @keyup.enter="submit"
        />
      </el-form-item>
      <el-button class="login-button" type="primary" native-type="submit" :loading="loading">Đăng nhập</el-button>
    </el-form>
    <p class="security-note">JWT access ngắn hạn · Refresh cookie HttpOnly · Tenant isolation</p>
  </div>
</template>
