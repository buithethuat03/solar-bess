<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { ChangeImpactDraft } from '@/types/risk-change.types';

const props = withDefaults(defineProps<{ modelValue: ChangeImpactDraft; disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ 'update:modelValue': [value: ChangeImpactDraft] }>();
const enabled = reactive({ scope: false, schedule: false, cost: false, quality: false, hse: false, contract: false });
const draft = reactive({
  scope: '', schedule: '', durationDeltaDays: 0, requiresRebaseline: false, affectedMilestoneIds: '',
  cost: '', amountDelta: '0', currency: 'USD', quality: '', hse: '', contract: ''
});
let resetting = false;

watch(() => props.modelValue, (value) => {
  resetting = true;
  Object.assign(enabled, {
    scope: Boolean(value.scope), schedule: Boolean(value.schedule), cost: Boolean(value.cost),
    quality: Boolean(value.quality), hse: Boolean(value.hse), contract: Boolean(value.contract)
  });
  Object.assign(draft, {
    scope: value.scope?.summary ?? '', schedule: value.schedule?.summary ?? '',
    durationDeltaDays: value.schedule?.durationDeltaDays ?? 0,
    requiresRebaseline: value.schedule?.requiresRebaseline ?? false,
    affectedMilestoneIds: value.schedule?.affectedMilestoneIds.join('\n') ?? '',
    cost: value.cost?.summary ?? '', amountDelta: value.cost?.amountDelta ?? '0',
    currency: value.cost?.currency ?? 'USD', quality: value.quality?.summary ?? '',
    hse: value.hse?.summary ?? '', contract: value.contract?.summary ?? ''
  });
  resetting = false;
}, { immediate: true, deep: true });

function sync(): void {
  if (resetting) return;
  const value: ChangeImpactDraft = {};
  if (enabled.scope) value.scope = { summary: draft.scope.trim() };
  if (enabled.schedule) value.schedule = {
    summary: draft.schedule.trim(), durationDeltaDays: Number(draft.durationDeltaDays),
    requiresRebaseline: draft.requiresRebaseline,
    affectedMilestoneIds: draft.affectedMilestoneIds.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  };
  if (enabled.cost) value.cost = {
    summary: draft.cost.trim(), amountDelta: draft.amountDelta.trim(),
    currency: draft.currency.trim().toUpperCase()
  };
  if (enabled.quality) value.quality = { summary: draft.quality.trim() };
  if (enabled.hse) value.hse = { summary: draft.hse.trim() };
  if (enabled.contract) value.contract = { summary: draft.contract.trim() };
  emit('update:modelValue', value);
}
</script>

<template>
  <fieldset class="change-impact-editor" :disabled="disabled" @input="sync" @change="sync">
    <legend>Six-dimension impact draft</legend>
    <p>Cho phép lưu partial draft; submit chỉ hợp lệ khi đủ sáu chiều và recommendation.</p>
    <section><label class="check-label"><input v-model="enabled.scope" type="checkbox" /> Scope</label><textarea v-if="enabled.scope" v-model="draft.scope" aria-label="Scope impact summary" required minlength="3" rows="2" /></section>
    <section><label class="check-label"><input v-model="enabled.schedule" type="checkbox" /> Schedule</label><template v-if="enabled.schedule"><textarea v-model="draft.schedule" aria-label="Schedule impact summary" required minlength="3" rows="2" /><div class="impact-inline"><label>Duration delta days<input v-model.number="draft.durationDeltaDays" type="number" min="-3650" max="3650" /></label><label class="check-label"><input v-model="draft.requiresRebaseline" type="checkbox" /> Requires rebaseline</label></div><label>Affected milestone UUIDs<textarea v-model="draft.affectedMilestoneIds" aria-label="Affected milestone IDs" rows="2" placeholder="Mỗi dòng một UUID" /></label></template></section>
    <section><label class="check-label"><input v-model="enabled.cost" type="checkbox" /> Cost</label><template v-if="enabled.cost"><textarea v-model="draft.cost" aria-label="Cost impact summary" required minlength="3" rows="2" /><div class="impact-inline"><label>Amount delta<input v-model.trim="draft.amountDelta" inputmode="decimal" pattern="-?[0-9]{1,15}(\.[0-9]{1,4})?" required /></label><label>Currency<input v-model.trim="draft.currency" pattern="[A-Z]{3}" maxlength="3" required /></label></div></template></section>
    <section><label class="check-label"><input v-model="enabled.quality" type="checkbox" /> Quality</label><textarea v-if="enabled.quality" v-model="draft.quality" aria-label="Quality impact summary" required minlength="3" rows="2" /></section>
    <section><label class="check-label"><input v-model="enabled.hse" type="checkbox" /> HSE</label><textarea v-if="enabled.hse" v-model="draft.hse" aria-label="HSE impact summary" required minlength="3" rows="2" /></section>
    <section><label class="check-label"><input v-model="enabled.contract" type="checkbox" /> Contract</label><textarea v-if="enabled.contract" v-model="draft.contract" aria-label="Contract impact summary" required minlength="3" rows="2" /></section>
  </fieldset>
</template>
