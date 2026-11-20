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
  minLength?: number
  maxLength?: number
  pattern?: string
  description?: string
}
interface ObjectSchema { properties: Record<string, Property>, required?: string[] }
interface Operation {
  description?: string
  requestBody: { content: { 'application/json': { schema: { $ref: string } } } }
  responses: Record<string, { description?: string }>
}
interface OpenApiDoc {
  paths: Record<string, { post: Operation }>
  components: { schemas: Record<string, ObjectSchema> }
}

const doc = JSON.parse(readFileSync(join(repoRoot(), 'public/openapi.json'), 'utf8')) as OpenApiDoc;
const FIELDS = ['commit', 'branch', 'pipeline_name', 'pipeline_url'];

function bodyOf(path: string): ObjectSchema {
  const ref = doc.paths[path].post.requestBody.content['application/json'].schema.$ref;
  return doc.components.schemas[ref.split('/').at(-1)!];
}

describe('BK-1995 — the public API reference describes the CI context (AC10, AC16)', () => {
  for (const path of ['/api/v1/runs/submissions', '/api/v1/runs']) {
    it(`${path} lists the four details as optional, with their limits`, () => {
      const body = bodyOf(path);
      for (const field of FIELDS) {
        expect(body.properties[field]).toBeDefined();
        expect(body.required ?? []).not.toContain(field);
        expect(body.properties[field].description).toContain('Optional.');
        expect(body.properties[field].description).toContain('details.field');
      }
      expect(body.properties.commit).toMatchObject({ minLength: 7, maxLength: 64 });
      expect(body.properties.commit.description).toContain('hexadecimal');
      expect(body.properties.branch).toMatchObject({ minLength: 1, maxLength: 255 });
      expect(body.properties.pipeline_name).toMatchObject({ minLength: 1, maxLength: 100 });
      expect(body.properties.pipeline_url).toMatchObject({ maxLength: 2048 });
      expect(body.properties.pipeline_url.description).toContain('http or https');
      expect(body.properties.pipeline_url.description).toContain('no credentials');
    });

    it(`${path} names the per-field refusal reasons in its 422`, () => {
      const description = doc.paths[path].post.responses['422'].description ?? '';
      for (const field of FIELDS) {
        expect(description).toContain(`${field}_invalid`);
      }
    });
  }

  it('tells a tag build to send the tag name in branch, because an empty branch is refused', () => {
    for (const path of ['/api/v1/runs/submissions', '/api/v1/runs']) {
      const branch = bodyOf(path).properties.branch.description ?? '';
      expect(branch).toContain('tag name');
      expect(branch).toContain('An empty branch is refused');
    }
  });

  it('the shared Run response returns the four details, nullable', () => {
    const run = doc.components.schemas.Run;
    for (const field of FIELDS) {
      const property = run.properties[field];
      expect(property).toBeDefined();
      expect(property.nullable === true || (Array.isArray(property.type) && property.type.includes('null'))).toBe(true);
    }
  });

  it('the streamed open documents the in-app refusal and the start_token conflict', () => {
    const open = doc.paths['/api/v1/runs'].post;
    expect(open.description).toContain('ci_context_not_allowed');
    expect(open.responses['409'].description).toContain('ci_context_conflict');
  });
});
