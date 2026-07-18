import type { EntityManager, Repository } from 'typeorm';
import type { AppConfig } from '../../../../src/config/environment';
import {
  ChangeRequestEntity, IssueEntity, PackageEntity, ProjectEntity, RiskEntity,
  RiskIssueActionEntity, RiskIssueClosureCycleEntity, RiskStatus
} from '../../../../src/database/entities';
import type { PermissionService } from '../../../../src/modules/identity-access/permission.service';
import type { CommandReceiptService } from '../../../../src/modules/operational-foundation/command-receipt.service';
import type { OutboxService } from '../../../../src/modules/operational-foundation/outbox.service';
import { RiskChangeService } from '../../../../src/modules/risk-change/risk-change.service';

const context = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  sessionId: '33333333-3333-4333-8333-333333333333',
  correlationId: 'test-correlation'
};
const projectId = '44444444-4444-4444-8444-444444444444';

function createService() {
  const projects = {
    existsBy: jest.fn().mockResolvedValue(true)
  } as unknown as Repository<ProjectEntity>;
  const permissions = {
    packageScopeIds: jest.fn().mockResolvedValue(null)
  } as unknown as PermissionService;
  const commands = {
    execute: jest.fn().mockResolvedValue({ id: 'result' })
  } as unknown as CommandReceiptService;
  const service = new RiskChangeService(
    {} as Repository<RiskEntity>,
    {} as Repository<IssueEntity>,
    {} as Repository<RiskIssueActionEntity>,
    {} as Repository<ChangeRequestEntity>,
    {} as Repository<RiskIssueClosureCycleEntity>,
    projects,
    {} as Repository<PackageEntity>,
    permissions,
    commands,
    {} as OutboxService,
    {
      riskChange: {
        highExposureThreshold: 15, criticalExposureThreshold: 20,
        alertScanIntervalMs: 60_000, scoringVersion: 'RISK_SCORING_5X5_MAX_V1',
        thresholdVersion: 'RISK_CHANGE_THRESHOLDS_V1'
      }
    } as AppConfig
  );
  return { service, permissions, commands };
}

describe('RiskChange command policy — TEST-014/TEST-015/TEST-017', () => {
  it('rejects a closure-only Risk command mixed with management fields', async () => {
    const { service } = createService();
    await expect(service.updateRisk(context, projectId, crypto.randomUUID(), {
      expectedVersion: 1,
      status: RiskStatus.CLOSURE_PENDING,
      closureReason: 'Evidence-backed closure',
      closureEvidenceRefs: [{ objectType: 'DOCUMENT', objectId: crypto.randomUUID() }],
      category: 'must-not-be-mixed'
    }, 'mixed-command-001')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RISK_CLOSURE_COMMAND_INVALID' })
    });
  });

  it('rejects expectedVersion-only no-op updates', async () => {
    const { service } = createService();
    await expect(service.updateRisk(
      context, projectId, crypto.randomUUID(), { expectedVersion: 1 }, 'no-op-command-001'
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'UPDATE_FIELDS_REQUIRED' })
    });
  });

  it('routes residual assessment through riskChange.manage, never requestClosure', async () => {
    const { service, permissions, commands } = createService();
    await service.updateRisk(context, projectId, crypto.randomUUID(), {
      expectedVersion: 1,
      residualAssessment: {
        probability: 2, costImpactRating: 2, scheduleImpactRating: 3, hseImpactRating: 2
      },
      residualAssessmentReason: 'Verified mitigation effectiveness',
      evidenceRefs: [{ objectType: 'DOCUMENT', objectId: crypto.randomUUID() }]
    }, 'residual-command-001');
    expect(permissions.packageScopeIds).toHaveBeenCalledWith(
      context, 'riskChange.manage', projectId
    );
    expect(commands.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects an active user without effective riskChange.manage in exact scope', async () => {
    const { service } = createService();
    const roleQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false)
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ProjectEntity) {
          return { findOneBy: jest.fn().mockResolvedValue({ portfolioId: crypto.randomUUID() }) };
        }
        if (entity === PackageEntity) {
          return { existsBy: jest.fn().mockResolvedValue(true) };
        }
        return { createQueryBuilder: jest.fn(() => roleQuery) };
      })
    } as unknown as EntityManager;
    const probe = service as unknown as {
      assertAssignable(
        manager: EntityManager, tenantId: string, projectId: string,
        packageId: string | null, ownerId: string
      ): Promise<void>;
    };
    await expect(probe.assertAssignable(
      manager, context.tenantId, projectId, crypto.randomUUID(), crypto.randomUUID()
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OWNER_NOT_ASSIGNABLE' })
    });
    expect(roleQuery.getExists).toHaveBeenCalledTimes(1);
  });
});
