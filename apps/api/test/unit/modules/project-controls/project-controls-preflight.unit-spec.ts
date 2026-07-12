import {
  PackageStatus, ProjectRecordStatus
} from 'src/database/entities';
import {
  ActivityTypeDto, type ApplyScheduleDraftDto, DraftModeDto, DraftSourceFormatDto
} from 'src/modules/project-controls/dto/project-controls.dto';
import { ProjectControlsService } from 'src/modules/project-controls/project-controls.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '44444444-4444-4444-8444-444444444444';
const PACKAGE_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PACKAGE_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface RepositoryStub {
  create: jest.Mock;
  findBy: jest.Mock;
  findOneBy: jest.Mock;
}

function repositoryStub(): RepositoryStub {
  return {
    create: jest.fn((value: object) => value),
    findBy: jest.fn().mockResolvedValue([]),
    findOneBy: jest.fn().mockResolvedValue(null)
  };
}

function draft(): ApplyScheduleDraftDto {
  return {
    mode: DraftModeDto.PREVIEW,
    expectedVersion: 0,
    source: { format: DraftSourceFormatDto.MANUAL, sourceName: 'Unit-test draft' },
    calendar: {
      timezone: 'Asia/Ho_Chi_Minh', calendarCode: 'VN_5D',
      workingWeek: [1, 2, 3, 4, 5], exceptions: []
    },
    wbsUpserts: [{
      clientRef: 'ROOT', packageId: PACKAGE_A_ID, code: 'ROOT', name: 'Root',
      weight: '100.0000', sortOrder: 0
    }],
    activityUpserts: [{
      clientRef: 'ACTIVITY', wbsClientRef: 'ROOT', packageId: PACKAGE_A_ID,
      ownerId: OWNER_ID, code: 'ACTIVITY', name: 'Activity',
      activityType: ActivityTypeDto.TASK, weight: '100.0000',
      plannedStart: '2026-07-13', durationWorkDays: 1
    }],
    dependencyUpserts: [],
    archiveWbsIds: [],
    archiveActivityIds: [],
    unlinkDependencyIds: []
  };
}

function harness(importMaxRows = 5_000) {
  const packages = repositoryStub();
  const projects = repositoryStub();
  const companies = repositoryStub();
  const users = repositoryStub();
  const schedules = repositoryStub();
  const wbsNodes = repositoryStub();
  const activities = repositoryStub();
  const dependencies = repositoryStub();
  const baselines = repositoryStub();
  const progressUpdates = repositoryStub();
  const notifications = repositoryStub();
  const audits = repositoryStub();
  const permissions = {
    has: jest.fn().mockResolvedValue(true),
    packageScopeIds: jest.fn().mockResolvedValue(null)
  };
  const commands = { execute: jest.fn() };
  const outbox = {};

  projects.findOneBy.mockResolvedValue({
    id: PROJECT_ID, tenantId: TENANT_ID, recordStatus: ProjectRecordStatus.ACTIVE
  });
  packages.findBy.mockResolvedValue([
    {
      id: PACKAGE_A_ID, tenantId: TENANT_ID, projectId: PROJECT_ID,
      status: PackageStatus.ACTIVE
    },
    {
      id: PACKAGE_B_ID, tenantId: TENANT_ID, projectId: PROJECT_ID,
      status: PackageStatus.ACTIVE
    }
  ]);
  users.findBy.mockResolvedValue([{ id: OWNER_ID, tenantId: TENANT_ID }]);

  const service = new ProjectControlsService(
    packages as never,
    projects as never,
    companies as never,
    users as never,
    schedules as never,
    wbsNodes as never,
    activities as never,
    dependencies as never,
    baselines as never,
    progressUpdates as never,
    notifications as never,
    audits as never,
    {
      schedule: {
        nearCriticalFloatDays: 5,
        defaultLookAheadDays: 21,
        importMaxRows,
        maxAbsoluteLagDays: 3_650,
        calculationVersion: 'SPI_WEIGHTED_LINEAR_V1',
        thresholdVersion: 'SCHEDULE_THRESHOLDS_V1'
      }
    } as never,
    permissions as never,
    commands as never,
    outbox as never
  );

  return { service, commands };
}

async function preview(
  input: ApplyScheduleDraftDto,
  importMaxRows = 5_000
) {
  const { service, commands } = harness(importMaxRows);
  const result = await service.applyDraft({
    tenantId: TENANT_ID, userId: USER_ID,
    sessionId: 'unit-session', correlationId: 'unit-correlation'
  }, PROJECT_ID, input, 'preview-does-not-consume-idempotency');
  expect(commands.execute).not.toHaveBeenCalled();
  return result;
}

describe('ProjectControlsService schedule preflight — TEST-010/208', () => {
  it('reports the configured aggregate import row limit during PREVIEW', async () => {
    const result = await preview(draft(), 1);

    expect(result.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'IMPORT_ROW_LIMIT_EXCEEDED', path: 'source' })
    ]));
  });

  it('reports duplicate activity clientRef values within one batch', async () => {
    const input = draft();
    input.activityUpserts = [
      { ...input.activityUpserts[0], weight: '50.0000' },
      {
        ...input.activityUpserts[0], code: 'ACTIVITY_2', name: 'Activity 2',
        weight: '50.0000'
      }
    ];

    const result = await preview(input);

    expect(result.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DUPLICATE_CLIENT_REF', path: 'activityUpserts[1].clientRef'
      })
    ]));
  });

  it('reports duplicate WBS clientRef even when it equals the first WBS code', async () => {
    const input = draft();
    input.wbsUpserts = [
      { ...input.wbsUpserts[0], weight: '50.0000' },
      {
        ...input.wbsUpserts[0], code: 'SECOND_ROOT', name: 'Second root',
        weight: '50.0000', sortOrder: 1
      }
    ];

    const result = await preview(input);

    expect(result.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_CLIENT_REF', path: 'wbsUpserts[1].clientRef' })
    ]));
  });

  it('reports a parent/child WBS package mismatch', async () => {
    const input = draft();
    input.wbsUpserts = [
      { ...input.wbsUpserts[0], weight: '100.0000' },
      {
        clientRef: 'CHILD', parentClientRef: 'ROOT', packageId: PACKAGE_B_ID,
        code: 'CHILD', name: 'Child', weight: '100.0000', sortOrder: 1
      }
    ];
    input.activityUpserts = [{
      ...input.activityUpserts[0], wbsClientRef: 'CHILD', packageId: PACKAGE_B_ID
    }];

    const result = await preview(input);

    expect(result.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'WBS_SCOPE_MISMATCH' })
    ]));
  });

  it('reports an activity whose package differs from its WBS package', async () => {
    const input = draft();
    input.activityUpserts = [{ ...input.activityUpserts[0], packageId: PACKAGE_B_ID }];

    const result = await preview(input);

    expect(result.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ACTIVITY_WBS_SCOPE_MISMATCH' })
    ]));
  });
});
