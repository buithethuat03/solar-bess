export interface LookAheadCsvActivity {
  id: string;
  code: string;
  name: string;
  packageId: string | null;
  ownerId: string;
  status: string;
  plannedStart: string;
  plannedFinish: string;
  forecastStart: string | null;
  forecastFinish: string | null;
  percentComplete: string;
  critical: boolean;
  nearCritical: boolean;
  totalFloatWorkDays: number;
}

const columns = [
  'projectId', 'activityId', 'code', 'name', 'packageId', 'ownerId', 'status',
  'plannedStart', 'plannedFinish', 'forecastStart', 'forecastFinish',
  'percentComplete', 'critical', 'nearCritical', 'totalFloatWorkDays'
];

export function exportLookAheadCsv(
  projectId: string, activities: readonly LookAheadCsvActivity[]
): string {
  const rows = activities.map((activity) => [
    projectId, activity.id, activity.code, activity.name, activity.packageId,
    activity.ownerId, activity.status, activity.plannedStart, activity.plannedFinish,
    activity.forecastStart, activity.forecastFinish, activity.percentComplete,
    activity.critical, activity.nearCritical, activity.totalFloatWorkDays
  ]);
  return `\uFEFF${[columns, ...rows].map((row) => (
    row.map(csvCell).join(',')
  )).join('\r\n')}\r\n`;
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
