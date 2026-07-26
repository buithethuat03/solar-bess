<script setup lang="ts">
import { computed } from 'vue';
import { SCAN_STATUS_GLYPH, SCAN_STATUS_HINT, SCAN_STATUS_LABEL } from '@/constants/documents';
import type { DocumentScanStatus } from '@/types/document.types';

const props = withDefaults(defineProps<{
  status: DocumentScanStatus;
  /** Adds the "vì sao chưa dùng được" line under the chip; off inside dense table cells. */
  hint?: boolean;
}>(), { hint: false });

const blocked = computed(() => props.status !== 'CLEAN');
const label = computed(() => SCAN_STATUS_LABEL[props.status]);
const hintText = computed(() => SCAN_STATUS_HINT[props.status]);
</script>

<template>
  <span class="scan-chip-wrap">
    <!-- The label already names the state; the glyph is decoration and must not be read twice. -->
    <span class="scan-chip" :data-scan="status" :data-blocked="blocked">
      <span aria-hidden="true">{{ SCAN_STATUS_GLYPH[status] }}</span>{{ label }}
    </span>
    <small v-if="hint && hintText" class="scan-chip__hint">{{ hintText }}</small>
  </span>
</template>
