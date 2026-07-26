<script setup lang="ts">
import { reactive, ref } from 'vue';
import DocumentScanChip from './DocumentScanChip.vue';
import { MAX_UPLOAD_BASE64_LENGTH, REVISION_CODE_PATTERN } from '@/constants/documents';
import type { CreateUploadSessionRequest, UploadOutcome } from '@/types/document.types';

defineProps<{
  documentCode: string;
  busy: boolean;
  outcome: UploadOutcome | null;
  /** True while an UNAVAILABLE session is still finalizable with a fresh Idempotency-Key. */
  retryable: boolean;
}>();
const emit = defineEmits<{ upload: [input: CreateUploadSessionRequest]; retry: [] }>();

const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const form = reactive({ revisionCode: '', purpose: '' });

/**
 * The API takes the bytes inline because no pre-signed URL exists: the server must be the one that
 * writes into quarantine. Chunking keeps a multi-megabyte file off a single `fromCharCode` call.
 */
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 8192)));
  }
  return btoa(chunks.join(''));
}

async function submit(): Promise<void> {
  error.value = '';
  if (!REVISION_CODE_PATTERN.test(form.revisionCode)) {
    error.value = 'Revision code phải viết hoa, tối đa 40 ký tự và chỉ dùng A–Z, 0–9, _ . -';
    return;
  }
  if (form.purpose.trim().length < 3) {
    error.value = 'Mục đích phát hành phải có ít nhất 3 ký tự.';
    return;
  }
  const file = fileInput.value?.files?.[0];
  if (!file) {
    error.value = 'Hãy chọn tệp cần tải lên.';
    return;
  }
  if (file.size === 0) {
    error.value = 'Tệp rỗng nên không thể quét; hãy chọn tệp khác.';
    return;
  }
  const content = await toBase64(file);
  if (content.length > MAX_UPLOAD_BASE64_LENGTH) {
    error.value = 'Tệp vượt quá giới hạn tải lên của API; hãy tách nhỏ tài liệu.';
    return;
  }
  emit('upload', {
    revisionCode: form.revisionCode, purpose: form.purpose.trim(),
    fileName: file.name, mimeType: file.type || 'application/octet-stream', content
  });
}
</script>

<template>
  <section class="document-upload" aria-labelledby="document-upload-title">
    <div class="section-heading">
      <div>
        <h3 id="document-upload-title">Tải revision mới cho {{ documentCode }}</h3>
        <p>Tệp vào quarantine trước; chỉ verdict của trình quét mới đưa nó sang release bucket.</p>
      </div>
    </div>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <form @submit.prevent="submit">
      <fieldset class="document-form form-fieldset" :disabled="busy">
        <label>Revision code<input v-model.trim="form.revisionCode" required placeholder="VD: A" /></label>
        <label>Mục đích phát hành<input v-model.trim="form.purpose" required maxlength="200" /></label>
        <label>Tệp<input ref="fileInput" type="file" required /></label>
        <div class="form-actions form-wide">
          <el-button native-type="submit" type="primary" :loading="busy">Tải lên và quét</el-button>
        </div>
      </fieldset>
    </form>

    <div v-if="outcome" class="upload-outcome" :data-verdict="outcome.verdict" role="status">
      <DocumentScanChip v-if="outcome.revision" :status="outcome.revision.scanStatus" />
      <p>{{ outcome.message }}</p>
      <p v-if="outcome.revision?.scanSignature" class="upload-outcome__signature">
        Chữ ký phát hiện: {{ outcome.revision.scanSignature }}
      </p>
      <el-button v-if="outcome.verdict === 'UNAVAILABLE' && retryable" :loading="busy" @click="emit('retry')">
        Quét lại
      </el-button>
    </div>
  </section>
</template>
