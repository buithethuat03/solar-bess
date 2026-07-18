import {
  countOpenApiOperations,
  createImplementedOpenApi,
  loadCanonicalOpenApi,
  parseCanonicalOpenApi
} from 'src/openapi/swagger';

describe('canonical Swagger contract — TEST-197/NFR-024', () => {
  it('loads the reviewed OpenAPI 3.1 contract instead of generating a second contract', () => {
    const document = loadCanonicalOpenApi();
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.title).toBe('Solar & BESS Project Management Platform API');
    expect(document.paths['/v1/auth/login']).toBeDefined();
    expect(countOpenApiOperations(document)).toBe(164);
  });

  it('derives a runtime view containing every and only implemented operation', () => {
    const implemented = createImplementedOpenApi(loadCanonicalOpenApi());
    expect(countOpenApiOperations(implemented)).toBe(51);
    const loginOperation = implemented.paths['/v1/auth/login']?.post as unknown as Record<string, unknown>;
    expect(loginOperation['x-implementation-status']).toBe('implemented');
    expect(implemented.paths['/v1/projects/{projectId}/risks']?.post).toBeDefined();
    expect(implemented.paths['/v1/me/permissions']).toBeUndefined();
    expect(implemented.webhooks).toBeUndefined();

    for (const pathItem of Object.values(implemented.paths)) {
      for (const method of ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const) {
        const operation = pathItem[method];
        if (operation) {
          expect((operation as unknown as Record<string, unknown>)['x-implementation-status'])
            .toBe('implemented');
        }
      }
    }
  });

  it('fails fast when the canonical file cannot be read', () => {
    expect(() => loadCanonicalOpenApi('/missing/openapi.yaml')).toThrow(
      'Cannot read canonical OpenAPI document'
    );
  });

  it('fails fast for malformed or non-3.1 contracts', () => {
    expect(() => parseCanonicalOpenApi('openapi: [', 'malformed.yaml')).toThrow(
      'Cannot parse canonical OpenAPI document'
    );
    expect(() => parseCanonicalOpenApi('openapi: 3.0.3\ninfo: {title: Legacy}\npaths: {/health: {}}', 'legacy.yaml'))
      .toThrow('must use OpenAPI 3.1.x');
  });
});
