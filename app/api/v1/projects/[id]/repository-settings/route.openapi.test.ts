import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'bun:test';

function repoRoot(): string {
  let dir = import.meta.dir;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('could not locate the repository root from this test file');
    }
    dir = parent;
  }
  return dir;
}

interface Property {
  type?: string | string[]
  nullable?: boolean
  pattern?: string
  description?: string
}
interface ObjectSchema { properties: Record<string, Property>, required?: string[] }
interface Operation {
  requestBody?: { content: { 'application/json': { schema: { $ref: string } } } }
  responses: Record<string, { description?: string }>
}
interface OpenApiDoc {
  paths: Record<string, { get?: Operation, put?: Operation }>
  components: { schemas: Record<string, ObjectSchema> }
}

const doc = JSON.parse(readFileSync(join(repoRoot(), 'public/openapi.json'), 'utf8')) as OpenApiDoc;
const PATH = '/api/v1/projects/{id}/repository-settings';

function schemaOf(ref: string): ObjectSchema {
  return doc.components.schemas[ref.split('/').at(-1)!];
}

describe('BK-2327 — the repository-settings route is documented like its tracker-settings sibling', () => {
  it('registers both GET and PUT in the published OpenAPI document', () => {
    expect(doc.paths[PATH]).toBeDefined();
    expect(doc.paths[PATH].get).toBeDefined();
    expect(doc.paths[PATH].put).toBeDefined();
  });

  it('GET responds 200 with the repository URL, and 403/404 for a caller without access', () => {
    const responses = doc.paths[PATH].get!.responses;
    expect(responses['200']).toBeDefined();
    expect(responses['403']).toBeDefined();
    expect(responses['404']).toBeDefined();
  });

  it('PUT documents the admin-required 403 and the validation 422', () => {
    const put = doc.paths[PATH].put!;
    const bodyRef = put.requestBody!.content['application/json'].schema.$ref;
    const body = schemaOf(bodyRef);
    expect(body.properties.repository_url).toBeDefined();
    expect(put.responses['403']?.description).toContain('admin_required');
    expect(put.responses['422']?.description).toContain('repository_url_invalid');
  });
});
