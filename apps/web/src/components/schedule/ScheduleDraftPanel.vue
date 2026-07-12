<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type {
  ApplyScheduleDraftRequest,
  ApplyScheduleDraftResult,
  ScheduleCalendar
} from '@/types/schedule.types';

const props = defineProps<{
  expectedVersion: number;
  calendar: ScheduleCalendar | null;
  previewResult: ApplyScheduleDraftResult | null;
  busy: boolean;
  canImport: boolean;
  modelValue: string | null;
}>();

const emit = defineEmits<{
  close: [];
  preview: [input: ApplyScheduleDraftRequest];
  commit: [input: ApplyScheduleDraftRequest];
  'update:modelValue': [value: string];
}>();

const parseError = ref('');
const lastPreviewText = ref('');
const sourceText = ref(props.modelValue ?? JSON.stringify({
  source: {
    format: props.canImport ? 'CANONICAL_JSON' : 'MANUAL',
    sourceName: props.canImport ? 'schedule.json' : 'manual-schedule'
  },
  calendar: props.calendar ?? { timezone: '', calendarCode: '', workingWeek: [], exceptions: [] },
  wbsUpserts: [],
  activityUpserts: [],
  dependencyUpserts: [],
  archiveWbsIds: [],
  archiveActivityIds: [],
  unlinkDependencyIds: []
}, null, 2));

watch(() => props.modelValue, (value) => {
  if (value !== null && value !== sourceText.value) sourceText.value = value;
});

onMounted(() => {
  if (props.modelValue === null) emit('update:modelValue', sourceText.value);
});

const canCommit = computed(() => Boolean(
  props.previewResult
  && !props.previewResult.validationIssues.some((issue) => issue.severity === 'ERROR')
  && lastPreviewText.value === sourceText.value
));

function parse(mode: 'PREVIEW' | 'COMMIT'): ApplyScheduleDraftRequest | null {
  parseError.value = '';
  try {
    const value = JSON.parse(sourceText.value) as Partial<ApplyScheduleDraftRequest>;
    const arrayFields = [
      'wbsUpserts', 'activityUpserts', 'dependencyUpserts',
      'archiveWbsIds', 'archiveActivityIds', 'unlinkDependencyIds'
    ] as const;
    if (!value.calendar || !value.source || arrayFields.some((field) => !Array.isArray(value[field]))) {
      throw new Error('Payload phải có source, calendar và đủ các danh sách delta tường minh.');
    }
    if (!props.canImport && value.source.format !== 'MANUAL') {
      throw new Error('Bạn cần quyền schedule.import để dùng CANONICAL_JSON hoặc CANONICAL_CSV.');
    }
    return {
      mode,
      expectedVersion: props.expectedVersion,
      source: value.source,
      calendar: value.calendar,
      wbsUpserts: value.wbsUpserts!,
      activityUpserts: value.activityUpserts!,
      dependencyUpserts: value.dependencyUpserts!,
      archiveWbsIds: value.archiveWbsIds!,
      archiveActivityIds: value.archiveActivityIds!,
      unlinkDependencyIds: value.unlinkDependencyIds!
    };
  } catch (caught) {
    parseError.value = caught instanceof Error ? caught.message : 'Canonical JSON không hợp lệ.';
    return null;
  }
}

function preview(): void {
  const input = parse('PREVIEW');
  if (!input) return;
  lastPreviewText.value = sourceText.value;
  emit('preview', input);
}

function commit(): void {
  if (!canCommit.value) return;
  const input = parse('COMMIT');
  if (input) emit('commit', input);
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    parseError.value = 'Tệp JSON vượt giới hạn giao diện 5 MB.';
    return;
  }
  sourceText.value = await file.text();
  emit('update:modelValue', sourceText.value);
  lastPreviewText.value = '';
  parseError.value = '';
}

function sourceChanged(): void {
  lastPreviewText.value = '';
  emit('update:modelValue', sourceText.value);
}
</script>

<template>
  <section class="schedule-command-form schedule-command-form--draft" aria-labelledby="draft-panel-title">
    <div class="schedule-command-form__heading">
      <div>
        <small>API-035 · EXPECTED VERSION {{ expectedVersion }}</small>
        <h3 id="draft-panel-title">Preview và commit schedule draft</h3>
        <p>Preview chỉ kiểm tra/reconcile. Commit chỉ mở sau preview hợp lệ; calendar/timezone phải được khai báo rõ, hệ thống không tự suy diễn ngày nghỉ.</p>
      </div>
      <button type="button" class="text-action" @click="emit('close')">Đóng</button>
    </div>
    <label v-if="canImport" class="schedule-file-input">Nạp canonical JSON<input type="file" accept="application/json,.json" @change="importFile" /></label>
    <p v-else class="schedule-readonly-note">Không có quyền import; payload phải dùng source format MANUAL.</p>
    <textarea
      v-model="sourceText"
      class="schedule-json-editor"
      rows="18"
      spellcheck="false"
      aria-label="Schedule draft canonical JSON"
      @input="sourceChanged"
    ></textarea>
    <el-alert v-if="parseError" type="error" :title="parseError" show-icon />
    <div v-if="previewResult" class="schedule-preview-result" aria-live="polite">
      <strong>{{ previewResult.validationIssues.some((item) => item.severity === 'ERROR') ? 'Preview có lỗi' : 'Preview hợp lệ' }}</strong>
      <span>{{ previewResult.validationIssues.length }} vấn đề · {{ previewResult.formulaVersion }}</span>
    </div>
    <ul v-if="previewResult?.validationIssues.length" class="schedule-preview-issues">
      <li
        v-for="issue in previewResult.validationIssues"
        :key="`${issue.code}-${issue.path}-${issue.row}`"
        :data-severity="issue.severity"
      >
        <strong>{{ issue.severity }} · {{ issue.code }}</strong>
        <span>{{ issue.message }}</span>
        <code>{{ issue.path }}{{ issue.row ? ` · dòng ${issue.row}` : '' }}</code>
      </li>
    </ul>
    <div class="schedule-command-form__actions">
      <el-button :loading="busy" @click="preview">Preview</el-button>
      <el-button type="primary" :loading="busy" :disabled="!canCommit" @click="commit">Commit draft</el-button>
    </div>
  </section>
</template>
