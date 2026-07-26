import {
  matchDelegations, type DelegationMatchRow
} from 'src/modules/workflow/domain/delegation-match';

const at = new Date('2026-07-26T12:00:00.000Z');

function row(overrides: Partial<DelegationMatchRow> = {}): DelegationMatchRow {
  return {
    id: 'delegation-1',
    delegatorId: 'delegator-1',
    status: 'ACTIVE',
    effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
    effectiveTo: new Date('2026-08-01T00:00:00.000Z'),
    scope: { workflowDefinitionCodes: [], projectIds: [] },
    ...overrides
  };
}

describe('US-018 delegation matcher — API-111 decide path', () => {
  it('matches an ACTIVE in-window delegation with an unrestricted scope', () => {
    expect(matchDelegations([row()], {
      definitionCode: 'WF-CHANGE', projectId: 'project-1', at
    })).toHaveLength(1);
  });

  it.each([['REVOKED'], ['EXPIRED']])('never matches a %s row, whatever its window', (status) => {
    expect(matchDelegations([row({ status })], {
      definitionCode: 'WF-CHANGE', projectId: 'project-1', at
    })).toHaveLength(0);
  });

  it('treats the window as [from, to): from inclusive, to exclusive', () => {
    const boundary = row();
    expect(matchDelegations([boundary], {
      definitionCode: null, projectId: 'project-1', at: boundary.effectiveFrom
    })).toHaveLength(1);
    expect(matchDelegations([boundary], {
      definitionCode: null, projectId: 'project-1', at: boundary.effectiveTo
    })).toHaveLength(0);
    expect(matchDelegations([boundary], {
      definitionCode: null, projectId: 'project-1',
      at: new Date(boundary.effectiveFrom.getTime() - 1)
    })).toHaveLength(0);
  });

  it('restricts by workflow definition code when the list is non-empty', () => {
    const scoped = row({ scope: { workflowDefinitionCodes: ['WF-CHANGE'], projectIds: [] } });
    expect(matchDelegations([scoped], {
      definitionCode: 'WF-CHANGE', projectId: 'project-1', at
    })).toHaveLength(1);
    expect(matchDelegations([scoped], {
      definitionCode: 'WF-OTHER', projectId: 'project-1', at
    })).toHaveLength(0);
    // An unresolvable definition can never satisfy a restricted list.
    expect(matchDelegations([scoped], {
      definitionCode: null, projectId: 'project-1', at
    })).toHaveLength(0);
  });

  it('restricts by project when the list is non-empty', () => {
    const scoped = row({ scope: { workflowDefinitionCodes: [], projectIds: ['project-1'] } });
    expect(matchDelegations([scoped], {
      definitionCode: 'WF-CHANGE', projectId: 'project-1', at
    })).toHaveLength(1);
    expect(matchDelegations([scoped], {
      definitionCode: 'WF-CHANGE', projectId: 'project-2', at
    })).toHaveLength(0);
  });

  it('requires BOTH scope dimensions to cover the instance', () => {
    const scoped = row({
      scope: { workflowDefinitionCodes: ['WF-CHANGE'], projectIds: ['project-1'] }
    });
    expect(matchDelegations([scoped], {
      definitionCode: 'WF-CHANGE', projectId: 'project-2', at
    })).toHaveLength(0);
    expect(matchDelegations([scoped], {
      definitionCode: 'WF-OTHER', projectId: 'project-1', at
    })).toHaveLength(0);
  });

  it('treats a malformed scope list as unrestricted rather than exploding', () => {
    const malformed = row({ scope: { workflowDefinitionCodes: 'WF-CHANGE', projectIds: null } });
    expect(matchDelegations([malformed], {
      definitionCode: 'WF-OTHER', projectId: 'project-9', at
    })).toHaveLength(1);
  });

  it('preserves the caller-supplied deterministic order', () => {
    const first = row({ id: 'a', delegatorId: 'delegator-a' });
    const second = row({ id: 'b', delegatorId: 'delegator-b' });
    const matched = matchDelegations([first, second], {
      definitionCode: 'WF-CHANGE', projectId: 'project-1', at
    });
    expect(matched.map((candidate) => candidate.delegatorId))
      .toEqual(['delegator-a', 'delegator-b']);
  });
});
