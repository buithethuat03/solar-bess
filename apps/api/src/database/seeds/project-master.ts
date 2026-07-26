import 'reflect-metadata';
import AppDataSource from '../data-source';
import { runProjectMasterSeed } from './project-master.seed';

/**
 * Two-phase runner:
 * - Phase 1 (master catalog: roles, cost codes, equipment models) reconciles into ANY environment
 *   holding exactly one ACTIVE tenant — no user guard.
 * - Phase 2 (demo project scaffold and demo plants) keeps the exactly-one-ACTIVE-test-user guard
 *   and is SKIPPED, with exit code 0, when the guard does not hold. That skip is the supported
 *   "reconcile an already-populated environment" path.
 */
async function run(): Promise<void> {
  await AppDataSource.initialize();
  const outcome = await AppDataSource.transaction(
    async (manager) => runProjectMasterSeed(manager)
  );
  await AppDataSource.destroy();
  if (outcome.demoProjectSeeded) {
    console.log('Project Master demo seed is ready; no credential was read or changed');
  } else {
    console.log(
      `Project Master master catalog reconciled; ${outcome.skippedReason ?? 'demo phase skipped'}`
    );
  }
}

void run().catch(async (error: unknown) => {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  console.error(error instanceof Error ? error.message : 'Project Master seed failed');
  process.exitCode = 1;
});
