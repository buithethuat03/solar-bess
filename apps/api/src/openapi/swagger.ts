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

export function configureSwagger(app: INestApplication): void {
  SwaggerModule.setup('api/docs', app, loadCanonicalOpenApi(), {
    customSiteTitle: 'Solar & BESS API Documentation',
    raw: ['yaml'],
    yamlDocumentUrl: 'api/docs/openapi.yaml',
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
      persistAuthorization: false,
      tryItOutEnabled: false,
      validatorUrl: null
    }
  });
}
