import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  CodReadinessQuery, CodReadinessResponse, CodTransitionCommandRequest, CodTransitionResponse,
  CommissioningSystemListQuery, CommissioningSystemListResponse, CommissioningSystemResponse,
  CompleteTestRunRequest, CreateCommissioningSystemRequest, CreateRetestRequest,
  CreateTestPackRequest, StartTestRunRequest, TestPackResponse, TestRunResponse
} from '@/types/commissioning.types';

/**
 * Commissioning & COD transport (API-098…API-105).
 *
 * Every command carries an Idempotency-Key of 8–200 characters. Two shapes here are load-bearing:
 * - There is NO "update test run result" function. API-102 records the result once and the row is
 *   frozen by trigger; the only forward path from a failure is API-103, which creates a NEW run.
 * - API-105 is a single endpoint carrying a closed `commandType` union. Sending an unknown verb is
 *   a 400 from `@IsIn`, so the union in `CodCommandType` is the whole vocabulary.
 */
function command<TResponse, TBody>(
  auth: ApiAuthContext, path: string, body: TBody, idempotencyKey: string
): Promise<TResponse> {
  return httpClient.request<TResponse, TBody>(path, {
    method: 'POST', auth, headers: commandHeaders(idempotencyKey), body
  });
}

export const commissioningApi = {
  /** API-098 — the system/subsystem register with the caller's ABAC reach applied in SQL. */
  listCommissioningSystems(
    auth: ApiAuthContext, projectId: string, query: CommissioningSystemListQuery = {}
  ): Promise<CommissioningSystemListResponse> {
    return httpClient.request(
      withQuery(`/v1/projects/${projectId}/commissioning-systems`, query), { method: 'GET', auth }
    );
  },

  /** API-099 — create a system boundary; a sub-system's parent must live in the same project. */
  createCommissioningSystem(
    auth: ApiAuthContext, projectId: string, input: CreateCommissioningSystemRequest, key: string
  ): Promise<CommissioningSystemResponse> {
    return command(auth, `/v1/projects/${projectId}/commissioning-systems`, input, key);
  },

  /**
   * API-100 — create the pack from an ISSUED + CLEAN procedure revision; it is born APPROVED and
   * frozen. A draft or quarantined revision answers 422 PROCEDURE_REVISION_LOCKED.
   */
  createTestPack(
    auth: ApiAuthContext, systemId: string, input: CreateTestPackRequest, key: string
  ): Promise<TestPackResponse> {
    return command(auth, `/v1/commissioning-systems/${systemId}/test-packs`, input, key);
  },

  /** API-101 — start a run once the pack's frozen prerequisites are satisfied. */
  startTestRun(
    auth: ApiAuthContext, testPackId: string, input: StartTestRunRequest, key: string
  ): Promise<TestRunResponse> {
    return command(auth, `/v1/test-packs/${testPackId}/test-runs`, input, key);
  },

  /**
   * API-102 — record the immutable result under optimistic concurrency. Evidence is mandatory
   * whatever the outcome; a second attempt answers 409 RESULT_ALREADY_RECORDED.
   */
  completeTestRun(
    auth: ApiAuthContext, testRunId: string, input: CompleteTestRunRequest, key: string
  ): Promise<TestRunResponse> {
    return command(auth, `/v1/test-runs/${testRunId}:complete`, input, key);
  },

  /** API-103 — a retest is a NEW run row linked by `previousRunId`; the failure never changes. */
  createRetest(
    auth: ApiAuthContext, testRunId: string, input: CreateRetestRequest, key: string
  ): Promise<TestRunResponse> {
    return command(auth, `/v1/test-runs/${testRunId}:create-retest`, input, key);
  },

  /** API-104 — the readiness matrix plus blocking findings, evaluated as of an instant. */
  readCodReadiness(
    auth: ApiAuthContext, projectId: string, query: CodReadinessQuery = {}
  ): Promise<CodReadinessResponse> {
    return httpClient.request(
      withQuery(`/v1/projects/${projectId}/cod-readiness`, query), { method: 'GET', auth }
    );
  },

  /**
   * API-105 — the closed COD transition command union. SIGN_COD is refused with 422 SOD_CONFLICT
   * when the signer submitted the package, and 422 GATE_BLOCKED while readiness is not clear.
   */
  codTransitionCommand(
    auth: ApiAuthContext, projectId: string, input: CodTransitionCommandRequest, key: string
  ): Promise<CodTransitionResponse> {
    return command(auth, `/v1/projects/${projectId}/cod-transition-commands`, input, key);
  }
};
