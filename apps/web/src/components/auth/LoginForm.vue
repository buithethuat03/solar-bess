<script setup lang="ts">
import { reactive } from 'vue';
import type { LoginInput } from '@/types/auth.types';

defineProps<{ loading: boolean; error: string }>();
const emit = defineEmits<{ submit: [input: LoginInput] }>();
const form = reactive<LoginInput>({ tenantCode: 'demo', email: '', password: '' });

function submit(): void {
  emit('submit', { ...form });
}
</script>

<template>
  <div class="login-card">
    <p class="eyebrow eyebrow--accent">SOLAR &amp; BESS</p>
    <h2>Đăng nhập nền tảng</h2>
    <p class="muted">Sử dụng tài khoản test được cấp cho tenant của bạn.</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="Mã tenant">
        <el-input v-model="form.tenantCode" name="tenantCode" autocomplete="organization" />
      </el-form-item>
      <el-form-item label="Email">
        <el-input v-model="form.email" name="email" type="email" autocomplete="username" />
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
