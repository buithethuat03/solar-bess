import { parseCanonicalOpenApi, loadCanonicalOpenApi } from 'src/openapi/swagger';

describe('canonical Swagger contract — TEST-197/NFR-024', () => {
  it('loads the reviewed OpenAPI 3.1 contract instead of generating a second contract', () => {
    const document = loadCanonicalOpenApi();
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.title).toBe('Solar & BESS Project Management Platform API');
    expect(document.paths['/v1/auth/login']).toBeDefined();
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
