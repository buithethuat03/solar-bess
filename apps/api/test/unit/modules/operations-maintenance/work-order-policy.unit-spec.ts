import { WorkOrderStatus } from 'src/database/entities';
import {
  WARRANTY_CLAIM_STATES, WORK_ORDER_COMMAND_TYPES, WORK_ORDER_TRANSITIONS, canTransition,
  type WorkOrderTransitionCommand
} from 'src/modules/operations-maintenance/domain/work-order-policy';

const ALL_STATUSES = Object.values(WorkOrderStatus);

describe('work order transition map — API-120 / WF-024', () => {
  it('exposes exactly the ten commands of the closed union', () => {
    expect([...WORK_ORDER_COMMAND_TYPES]).toEqual([
      'DISPATCH', 'START', 'HOLD', 'RESUME', 'COMPLETE', 'VERIFY', 'CLOSE', 'REOPEN', 'CANCEL',
      'RAISE_WARRANTY_CLAIM'
    ]);
    // RAISE_WARRANTY_CLAIM appends a DB-088 row; it is deliberately not a state transition.
    expect(Object.keys(WORK_ORDER_TRANSITIONS)).not.toContain('RAISE_WARRANTY_CLAIM');
    expect(Object.keys(WORK_ORDER_TRANSITIONS)).toHaveLength(WORK_ORDER_COMMAND_TYPES.length - 1);
  });

  it.each<[WorkOrderTransitionCommand, WorkOrderStatus[], WorkOrderStatus]>([
    ['DISPATCH',
      [WorkOrderStatus.DRAFT, WorkOrderStatus.APPROVED, WorkOrderStatus.SCHEDULED],
      WorkOrderStatus.DISPATCHED],
    ['START',
      [WorkOrderStatus.DISPATCHED, WorkOrderStatus.REOPENED], WorkOrderStatus.IN_PROGRESS],
    ['HOLD', [WorkOrderStatus.IN_PROGRESS], WorkOrderStatus.ON_HOLD],
    ['RESUME', [WorkOrderStatus.ON_HOLD], WorkOrderStatus.IN_PROGRESS],
    ['COMPLETE', [WorkOrderStatus.IN_PROGRESS], WorkOrderStatus.COMPLETE],
    ['VERIFY', [WorkOrderStatus.COMPLETE], WorkOrderStatus.VERIFIED],
    ['CLOSE', [WorkOrderStatus.VERIFIED], WorkOrderStatus.CLOSED],
    ['REOPEN', [WorkOrderStatus.VERIFIED, WorkOrderStatus.CLOSED], WorkOrderStatus.REOPENED],
    ['CANCEL', [WorkOrderStatus.DRAFT, WorkOrderStatus.VERIFIED], WorkOrderStatus.CANCELLED]
  ])('%s fires only from its declared from-states', (command, from, to) => {
    expect(WORK_ORDER_TRANSITIONS[command].to).toBe(to);
    for (const status of ALL_STATUSES) {
      expect(canTransition(command, status)).toBe(from.includes(status));
    }
  });

  it('never lets a terminal state move again', () => {
    const transitionCommands = Object.keys(WORK_ORDER_TRANSITIONS) as WorkOrderTransitionCommand[];
    for (const command of transitionCommands) {
      expect(canTransition(command, WorkOrderStatus.CANCELLED)).toBe(false);
    }
    // CLOSED is terminal except for the one edge WF-024 draws out of it.
    const fromClosed = transitionCommands.filter(
      (command) => canTransition(command, WorkOrderStatus.CLOSED)
    );
    expect(fromClosed).toEqual(['REOPEN']);
  });

  it('keeps completion and verification as two separate steps', () => {
    // No command jumps IN_PROGRESS straight to VERIFIED or CLOSED: the verifier-independence rule
    // has no meaning if a single actor can complete and verify in one call.
    const jumps = (Object.keys(WORK_ORDER_TRANSITIONS) as WorkOrderTransitionCommand[])
      .filter((command) => canTransition(command, WorkOrderStatus.IN_PROGRESS))
      .map((command) => WORK_ORDER_TRANSITIONS[command].to);
    expect(jumps).not.toContain(WorkOrderStatus.VERIFIED);
    expect(jumps).not.toContain(WorkOrderStatus.CLOSED);
    expect(WORK_ORDER_TRANSITIONS.CLOSE.from).toEqual([WorkOrderStatus.VERIFIED]);
  });

  it('allows a warranty claim only where work has actually happened', () => {
    expect(WARRANTY_CLAIM_STATES).not.toContain(WorkOrderStatus.DRAFT);
    expect(WARRANTY_CLAIM_STATES).not.toContain(WorkOrderStatus.APPROVED);
    expect(WARRANTY_CLAIM_STATES).not.toContain(WorkOrderStatus.SCHEDULED);
    expect(WARRANTY_CLAIM_STATES).not.toContain(WorkOrderStatus.CANCELLED);
    expect(WARRANTY_CLAIM_STATES).toContain(WorkOrderStatus.IN_PROGRESS);
    expect(WARRANTY_CLAIM_STATES).toContain(WorkOrderStatus.CLOSED);
  });
});
