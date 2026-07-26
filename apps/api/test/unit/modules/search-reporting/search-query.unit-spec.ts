import {
  buildSearchQuery, escapeLikePattern, SEARCH_RESULT_TYPES, type SearchScopes
} from 'src/modules/search-reporting/domain/search-query';

const tenantId = '20000000-0000-4000-8000-000000000001';
const projectA = '50000000-0000-4000-8000-00000000000a';
const packageA = '60000000-0000-4000-8000-00000000000a';

function scopes(overrides: Partial<SearchScopes> = {}): SearchScopes {
  return {
    projectVisibleIds: null,
    document: { tenantWide: true, projectIds: [], packageIds: [] },
    riskChange: { tenantWide: true, projectIds: [], packageIds: [] },
    contract: { tenantWide: true, projectIds: [], packageIds: [] },
    ...overrides
  };
}

describe('API-130 relational search query builder — SEC-107/SEC-112', () => {
  it('escapes every LIKE metacharacter so input cannot widen its own match', () => {
    expect(escapeLikePattern('50%_\\done')).toBe('50\\%\\_\\\\done');
    expect(escapeLikePattern('plain')).toBe('plain');
  });

  it('builds one statement with every branch for a tenant-wide reader', () => {
    const built = buildSearchQuery({
      tenantId, query: 'PRJ', types: [...SEARCH_RESULT_TYPES], limit: 20, scopes: scopes()
    });
    expect(built).not.toBeNull();
    for (const type of SEARCH_RESULT_TYPES) {
      expect(built!.sql).toContain(`'${type}' AS "type"`);
    }
    // Exactly one statement: UNION ALL between branches, a single overall LIMIT.
    expect(built!.sql.match(/UNION ALL/g)).toHaveLength(SEARCH_RESULT_TYPES.length - 1);
    expect(built!.sql.match(/LIMIT \$/g)).toHaveLength(1);
    // The tenant mandate appears in every branch.
    expect(built!.sql.match(/tenant_id = \$1::uuid/g)).toHaveLength(SEARCH_RESULT_TYPES.length);
    // The limit rides as the final parameter.
    expect(built!.parameters.at(-1)).toBe(20);
  });

  it('restricts the statement to the requested register subset', () => {
    const built = buildSearchQuery({
      tenantId, query: 'PRJ', types: ['RISK', 'ISSUE'], limit: 10, scopes: scopes()
    });
    expect(built!.sql).toContain(`'RISK' AS "type"`);
    expect(built!.sql).toContain(`'ISSUE' AS "type"`);
    expect(built!.sql).not.toContain(`'PROJECT' AS "type"`);
    expect(built!.sql).not.toContain(`'DOCUMENT' AS "type"`);
    expect(built!.sql).not.toContain(`'CONTRACT' AS "type"`);
  });

  it('omits a module branch entirely when the caller has no reach into it', () => {
    const built = buildSearchQuery({
      tenantId, query: 'PRJ', types: [...SEARCH_RESULT_TYPES], limit: 20,
      scopes: scopes({
        document: { tenantWide: false, projectIds: [], packageIds: [] },
        contract: { tenantWide: false, projectIds: [], packageIds: [packageA] }
      })
    });
    // No document.read reach at all → no DOCUMENT branch; contracts are project-level, so a
    // package-only principal gets no CONTRACT branch either.
    expect(built!.sql).not.toContain(`'DOCUMENT' AS "type"`);
    expect(built!.sql).not.toContain(`'CONTRACT' AS "type"`);
    expect(built!.sql).toContain(`'RISK' AS "type"`);
  });

  it('returns null when nothing is authorized, so the service answers an empty page', () => {
    const built = buildSearchQuery({
      tenantId, query: 'PRJ', types: [...SEARCH_RESULT_TYPES], limit: 20,
      scopes: scopes({
        projectVisibleIds: [],
        document: { tenantWide: false, projectIds: [], packageIds: [] },
        riskChange: { tenantWide: false, projectIds: [], packageIds: [] },
        contract: { tenantWide: false, projectIds: [], packageIds: [] }
      })
    });
    expect(built).toBeNull();
  });

  it('binds project and package reach as per-branch predicates', () => {
    const built = buildSearchQuery({
      tenantId, query: 'RSK', types: ['RISK'], limit: 5,
      scopes: scopes({
        riskChange: { tenantWide: false, projectIds: [projectA], packageIds: [packageA] }
      })
    });
    expect(built!.sql).toContain('risk.project_id = ANY(');
    expect(built!.sql).toContain('risk.package_id = ANY(');
    expect(built!.parameters).toEqual(expect.arrayContaining([[projectA], [packageA]]));
  });

  it('matches codes as prefixes and titles as contains with the escaped needle', () => {
    const built = buildSearchQuery({
      tenantId, query: '50%', types: ['PROJECT'], limit: 5, scopes: scopes()
    });
    expect(built!.parameters).toEqual(expect.arrayContaining(['50\\%%', '%50\\%%']));
    expect(built!.sql).toContain("ESCAPE '\\'");
  });

  it('never selects content columns — only the register identity tuple', () => {
    const built = buildSearchQuery({
      tenantId, query: 'DOC', types: ['DOCUMENT'], limit: 5, scopes: scopes()
    });
    for (const column of ['"type"', '"id"', '"code"', '"title"', '"projectId"']) {
      expect(built!.sql).toContain(column);
    }
    expect(built!.sql).not.toMatch(/classification|object_key|sha256|content/);
  });
});
