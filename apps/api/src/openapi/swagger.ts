import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSON_SCHEMA, load } from 'js-yaml';

const CANONICAL_OPENAPI_PATH = resolve(
  __dirname,
  '../../../../docs/openapi/openapi.yaml'
);

const OPERATION_METHODS = [
  'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'
] as const;
const PATH_ITEM_METADATA = [
  '$ref', 'summary', 'description', 'servers', 'parameters'
] as const;
type PathItemObject = OpenAPIObject['paths'][string];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseCanonicalOpenApi(source: string, sourceName: string): OpenAPIObject {
  let parsed: unknown;
  try {
    parsed = load(source, { schema: JSON_SCHEMA });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown YAML error';
    throw new Error(`Cannot parse canonical OpenAPI document ${sourceName}: ${reason}`);
  }

  if (!isRecord(parsed) || typeof parsed.openapi !== 'string' || !parsed.openapi.startsWith('3.1.')) {
    throw new Error(`Canonical OpenAPI document ${sourceName} must use OpenAPI 3.1.x`);
  }
  if (!isRecord(parsed.info) || typeof parsed.info.title !== 'string' || !parsed.info.title.trim()) {
    throw new Error(`Canonical OpenAPI document ${sourceName} must define info.title`);
  }
  if (!isRecord(parsed.paths) || Object.keys(parsed.paths).length === 0) {
    throw new Error(`Canonical OpenAPI document ${sourceName} must define at least one path`);
  }

  return parsed as unknown as OpenAPIObject;
}

export function loadCanonicalOpenApi(
  path = CANONICAL_OPENAPI_PATH
): OpenAPIObject {
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown filesystem error';
    throw new Error(`Cannot read canonical OpenAPI document ${path}: ${reason}`);
  }
  return parseCanonicalOpenApi(source, path);
}

function filterImplementedPathItem(
  pathItem: PathItemObject,
  usedTags: Set<string>
): PathItemObject | undefined {
  const source = pathItem as unknown as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  let operationCount = 0;

  for (const key of PATH_ITEM_METADATA) {
    if (source[key] !== undefined) filtered[key] = source[key];
  }
  for (const method of OPERATION_METHODS) {
    const operation = source[method];
    if (!isRecord(operation) || operation['x-implementation-status'] !== 'implemented') continue;
    filtered[method] = operation;
    operationCount += 1;
    if (Array.isArray(operation.tags)) {
      for (const tag of operation.tags) {
        if (typeof tag === 'string') usedTags.add(tag);
      }
    }
  }

  return operationCount > 0 ? filtered as unknown as PathItemObject : undefined;
}

function filterImplementedPathItems(
  pathItems: Record<string, PathItemObject> | undefined,
  usedTags: Set<string>
): Record<string, PathItemObject> {
  const filtered: Record<string, PathItemObject> = {};
  for (const [path, pathItem] of Object.entries(pathItems ?? {})) {
    const implemented = filterImplementedPathItem(pathItem, usedTags);
    if (implemented) filtered[path] = implemented;
  }
  return filtered;
}

export function countOpenApiOperations(document: OpenAPIObject): number {
  const count = (pathItems: Record<string, PathItemObject> | undefined): number =>
    Object.values(pathItems ?? {}).reduce((total, pathItem) => {
      const source = pathItem as unknown as Record<string, unknown>;
      return total + OPERATION_METHODS.filter((method) => isRecord(source[method])).length;
    }, 0);
  return count(document.paths) + count(document.webhooks);
}

export function createImplementedOpenApi(document: OpenAPIObject): OpenAPIObject {
  const usedTags = new Set<string>();
  const paths = filterImplementedPathItems(document.paths, usedTags);
  const webhooks = filterImplementedPathItems(document.webhooks, usedTags);
  const description = [
    'Runtime view: chỉ gồm các operation đã được triển khai và đánh dấu x-implementation-status: implemented.',
    document.info.description
  ].filter(Boolean).join('\n\n');

  return {
    ...document,
    info: {
      ...document.info,
      title: `${document.info.title} — Implemented APIs`,
      description
    },
    paths,
    ...(Object.keys(webhooks).length > 0 ? { webhooks } : { webhooks: undefined }),
    tags: document.tags?.filter((tag) => usedTags.has(tag.name))
  };
}

function swaggerOptions(customSiteTitle: string, yamlDocumentUrl: string) {
  return {
    customSiteTitle,
    raw: ['yaml'] as Array<'yaml'>,
    yamlDocumentUrl,
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
      persistAuthorization: false,
      tryItOutEnabled: false,
      validatorUrl: null
    }
  };
}

export function configureSwagger(app: INestApplication): void {
  const designDocument = loadCanonicalOpenApi();
  SwaggerModule.setup(
    'api/docs',
    app,
    createImplementedOpenApi(designDocument),
    swaggerOptions('Solar & BESS Implemented API Documentation', 'api/docs/openapi.yaml')
  );
  SwaggerModule.setup(
    'api/design-docs',
    app,
    designDocument,
    swaggerOptions('Solar & BESS API Design Documentation', 'api/design-docs/openapi.yaml')
  );
}
