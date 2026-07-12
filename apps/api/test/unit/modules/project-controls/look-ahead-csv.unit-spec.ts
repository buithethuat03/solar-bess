import { exportLookAheadCsv } from 'src/modules/project-controls/domain/look-ahead-csv';

describe('look-ahead CSV export — TEST-010/190', () => {
  it('emits UTF-8 BOM, quotes fields and neutralizes spreadsheet formulas', () => {
    const csv = exportLookAheadCsv('project-1', [{
      id: 'activity-1', code: 'ACT-01', name: '=HYPERLINK("bad")',
      packageId: null, ownerId: 'owner-1', status: 'READY',
      plannedStart: '2026-07-13', plannedFinish: '2026-07-17',
      forecastStart: null, forecastFinish: null, percentComplete: '0.00',
      critical: false, nearCritical: true, totalFloatWorkDays: 3
    }]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"project-1","activity-1","ACT-01"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
