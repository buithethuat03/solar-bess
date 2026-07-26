import { NcrStatus, PunchItemStatus } from 'src/database/entities';
import {
  NCR_RETURN_STATUS, NCR_TRANSITIONS, PUNCH_RETURN_STATUS, PUNCH_TRANSITIONS, canTransition
} from 'src/modules/field-hse-quality/domain/state-policy';

describe('Field, HSE & Quality state policy — API-096/API-097', () => {
  it('walks the full NCR happy path in order', () => {
    const path = [
      ['CONTAIN', NcrStatus.OPEN, NcrStatus.CONTAINED],
      ['RECORD_ROOT_CAUSE', NcrStatus.CONTAINED, NcrStatus.ROOT_CAUSE],
      ['PROPOSE_DISPOSITION', NcrStatus.ROOT_CAUSE, NcrStatus.DISPOSITION_PROPOSED],
      ['DECIDE_DISPOSITION', NcrStatus.DISPOSITION_PROPOSED, NcrStatus.DISPOSITION_APPROVED],
      ['START_RECTIFICATION', NcrStatus.DISPOSITION_APPROVED, NcrStatus.RECTIFICATION],
      ['REQUEST_VERIFICATION', NcrStatus.RECTIFICATION, NcrStatus.READY_FOR_VERIFICATION],
      ['VERIFY_CLOSE', NcrStatus.READY_FOR_VERIFICATION, NcrStatus.CLOSED],
      ['REOPEN', NcrStatus.CLOSED, NcrStatus.REOPENED],
      ['START_RECTIFICATION', NcrStatus.REOPENED, NcrStatus.RECTIFICATION]
    ] as const;
    for (const [command, from, to] of path) {
      expect(canTransition(NCR_TRANSITIONS, command, from)).toBe(true);
      expect(NCR_TRANSITIONS[command].to).toBe(to);
    }
  });

  it('allows a returned proposal to be re-proposed, and resolves RETURN to RETURNED', () => {
    expect(canTransition(NCR_TRANSITIONS, 'PROPOSE_DISPOSITION', NcrStatus.RETURNED)).toBe(true);
    expect(NCR_RETURN_STATUS).toBe(NcrStatus.RETURNED);
  });

  it.each([
    ['CONTAIN', NcrStatus.CLOSED],
    ['CONTAIN', NcrStatus.CONTAINED],
    ['RECORD_ROOT_CAUSE', NcrStatus.OPEN],
    ['PROPOSE_DISPOSITION', NcrStatus.OPEN],
    ['PROPOSE_DISPOSITION', NcrStatus.DISPOSITION_PROPOSED],
    ['DECIDE_DISPOSITION', NcrStatus.ROOT_CAUSE],
    ['VERIFY_CLOSE', NcrStatus.RECTIFICATION],
    ['VERIFY_CLOSE', NcrStatus.CLOSED],
    ['REOPEN', NcrStatus.OPEN]
  ] as const)('refuses NCR %s from %s', (command, from) => {
    expect(canTransition(NCR_TRANSITIONS, command, from)).toBe(false);
  });

  it('walks the punch machine and resolves RETURN back to OPEN', () => {
    expect(canTransition(PUNCH_TRANSITIONS, 'REQUEST_CLOSURE', PunchItemStatus.OPEN)).toBe(true);
    expect(PUNCH_TRANSITIONS.REQUEST_CLOSURE.to).toBe(PunchItemStatus.READY_FOR_VERIFICATION);
    expect(canTransition(
      PUNCH_TRANSITIONS, 'DECIDE_CLOSURE', PunchItemStatus.READY_FOR_VERIFICATION
    )).toBe(true);
    expect(PUNCH_TRANSITIONS.DECIDE_CLOSURE.to).toBe(PunchItemStatus.CLOSED);
    expect(canTransition(PUNCH_TRANSITIONS, 'WAIVE', PunchItemStatus.OPEN)).toBe(true);
    expect(PUNCH_RETURN_STATUS).toBe(PunchItemStatus.OPEN);
  });

  it.each([
    ['REQUEST_CLOSURE', PunchItemStatus.READY_FOR_VERIFICATION],
    ['REQUEST_CLOSURE', PunchItemStatus.CLOSED],
    ['DECIDE_CLOSURE', PunchItemStatus.OPEN],
    ['WAIVE', PunchItemStatus.READY_FOR_VERIFICATION],
    ['WAIVE', PunchItemStatus.CLOSED],
    ['WAIVE', PunchItemStatus.WAIVED]
  ] as const)('refuses punch %s from %s', (command, from) => {
    expect(canTransition(PUNCH_TRANSITIONS, command, from)).toBe(false);
  });
});
