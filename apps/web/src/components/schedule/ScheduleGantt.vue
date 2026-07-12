<script setup lang="ts">
import { computed } from 'vue';
import type { ScheduleActivity, SchedulePackage, WbsNode } from '@/types/schedule.types';

const props = defineProps<{
  activities: ScheduleActivity[];
  wbsNodes: WbsNode[];
  packages: SchedulePackage[];
  progressActivityIds: string[];
}>();

const emit = defineEmits<{
  select: [activity: ScheduleActivity];
  progress: [activity: ScheduleActivity];
}>();

const DAY = 86_400_000;

function day(value: string): number {
  return Date.parse(`${value}T00:00:00Z`) / DAY;
}

const sortedActivities = computed(() => {
  const order = new Map(props.wbsNodes.map((node, index) => [node.id, index]));
  return [...props.activities].sort((left, right) =>
    (order.get(left.wbsId) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.wbsId) ?? Number.MAX_SAFE_INTEGER)
    || left.plannedStart.localeCompare(right.plannedStart)
    || left.code.localeCompare(right.code)
  );
});

const timeline = computed(() => {
  const dates = props.activities.flatMap((activity) => [
    activity.plannedStart,
    activity.plannedFinish,
    activity.forecastStart,
    activity.forecastFinish
  ].filter((value): value is string => Boolean(value)));
  if (dates.length === 0) return { start: 0, span: 1 };
  const values = dates.map(day);
  const start = Math.min(...values);
  return { start, span: Math.max(1, Math.max(...values) - start + 1) };
});

const wbsNames = computed(() => new Map(props.wbsNodes.map((node) => [node.id, `${node.code} · ${node.name}`])));
const packageNames = computed(() => new Map(props.packages.map((item) => [item.id, item.code])));
const progressActivityIds = computed(() => new Set(props.progressActivityIds));

function barStyle(start: string, finish: string): Record<string, string> {
  const left = ((day(start) - timeline.value.start) / timeline.value.span) * 100;
  const width = Math.max(1.2, ((day(finish) - day(start) + 1) / timeline.value.span) * 100);
  return { left: `${Math.max(0, left)}%`, width: `${Math.min(100 - Math.max(0, left), width)}%` };
}

function activityLabel(activity: ScheduleActivity): string {
  const flags = [activity.critical ? 'đường găng' : '', activity.nearCritical ? 'gần đường găng' : ''].filter(Boolean).join(', ');
  return `${activity.code}, ${activity.name}, ${activity.percentComplete}%${flags ? `, ${flags}` : ''}`;
}
</script>

<template>
  <div class="schedule-gantt" role="region" aria-label="WBS và biểu đồ Gantt">
    <div class="schedule-gantt__legend" aria-label="Chú giải">
      <span><i class="legend-plan"></i>Kế hoạch hiện tại</span>
      <span><i class="legend-forecast"></i>Forecast</span>
      <span><i class="legend-critical"></i>Đường găng</span>
      <span><i class="legend-near"></i>Gần đường găng</span>
      <span><i class="legend-milestone"></i>Milestone</span>
    </div>
    <div class="schedule-gantt__header">
      <span>WBS / Activity</span><span>Kế hoạch và forecast</span><span>Tiến độ</span>
    </div>
    <div
      v-for="activity in sortedActivities"
      :key="activity.id"
      class="schedule-gantt__row"
      role="button"
      tabindex="0"
      :aria-label="activityLabel(activity)"
      @click="emit('select', activity)"
      @keydown.enter="emit('select', activity)"
      @keydown.space.prevent="emit('select', activity)"
    >
      <span class="schedule-gantt__identity">
        <small>{{ wbsNames.get(activity.wbsId) ?? 'WBS không khả dụng' }}</small>
        <strong>{{ activity.code }} · {{ activity.name }}</strong>
        <em>{{ activity.packageId ? packageNames.get(activity.packageId) : 'Không có package' }} · {{ activity.status }}</em>
      </span>
      <span class="schedule-gantt__track" aria-hidden="true">
        <i
          v-if="activity.activityType === 'TASK'"
          class="schedule-gantt__plan"
          :style="barStyle(activity.plannedStart, activity.plannedFinish)"
        ></i>
        <i
          v-if="activity.activityType === 'TASK' && activity.forecastStart && activity.forecastFinish"
          class="schedule-gantt__forecast"
          :class="{ 'is-critical': activity.critical, 'is-near-critical': activity.nearCritical && !activity.critical }"
          :style="barStyle(activity.forecastStart, activity.forecastFinish)"
        ></i>
        <i
          v-if="activity.activityType === 'MILESTONE'"
          class="schedule-gantt__milestone"
          :class="{ 'is-critical': activity.critical }"
          :style="barStyle(activity.forecastFinish ?? activity.plannedFinish, activity.forecastFinish ?? activity.plannedFinish)"
        ></i>
      </span>
      <span class="schedule-gantt__progress">
        <strong>{{ activity.percentComplete }}%</strong>
        <small>Float {{ activity.totalFloatWorkDays }} ngày</small>
        <el-button
          v-if="progressActivityIds.has(activity.id) && activity.status !== 'CANCELLED'"
          size="small"
          text
          @click.stop="emit('progress', activity)"
        >Cập nhật</el-button>
      </span>
    </div>
  </div>
</template>
