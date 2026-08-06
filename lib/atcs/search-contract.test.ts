import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import yaml from 'yaml';

// BK-187 — regression guard for the ATC search response-shape spec drift.
//
// `scripts/openapi-diff.ts` only compares operation existence (method + path)
// between the SRS and the generated contract; it never inspects schema
// fields or enum values. That is exactly why the `id`/`status` vs
// `atc_id`/`status_dot` naming divergence, and the missing `unrun` enum
// value, went undetected for five weeks (BK-187). This test locks the
// `/atcs/search` response shape in `.context/SRS/api-contracts.yaml` to the
// shape the app actually ships (`public/openapi.json`, generated from
// `app/api/v1/atcs/search/route.openapi.ts`), field-by-field and
// enum-value-by-value.
//
// Deliberately scoped to this ONE operation — see BK-187's report for why a
// general deep differ across the whole hand-authored SRS is out of scope
// (it would surface dozens of unrelated pre-existing drifts and break CI).

const SRS_PATH = resolve(process.cwd(), '.context/SRS/api-contracts.yaml');
const GENERATED_PATH = resolve(process.cwd(), 'public/openapi.json');

interface JsonSchema {
  properties?: Record<string, { enum?: string[] }>
  ['$ref']?: string
}

function readSrs(): any {
  return yaml.parse(readFileSync(SRS_PATH, 'utf8'));
}

function readGenerated(): any {
  return JSON.parse(readFileSync(GENERATED_PATH, 'utf8'));
}

function resolveSchema(spec: any, schemaOrRef: JsonSchema): any {
  const ref = schemaOrRef?.$ref;
  if (ref) {
    const name = ref.split('/').pop() ?? '';
    return spec.components.schemas[name];
  }
  return schemaOrRef;
}

function getSrsSearchItemSchema(srs: any): any {
  const op = srs.paths?.['/atcs/search']?.get;
  const itemsSchema = op?.responses?.['200']?.content?.['application/json']?.schema?.properties?.items?.items;
  return itemsSchema ? resolveSchema(srs, itemsSchema) : undefined;
}

describe('BK-187 — /atcs/search response contract (SRS vs generated)', () => {
  test('SRS defines the /atcs/search GET operation (was entirely absent pre-BK-187)', () => {
    const srs = readSrs();
    expect(srs.paths?.['/atcs/search']?.get).toBeDefined();
  });

  test('SRS AtcSearchResult item field names match the generated AtcSearchResult schema', () => {
    const srs = readSrs();
    const generated = readGenerated();

    const srsItemSchema = getSrsSearchItemSchema(srs);
    const generatedItemSchema = generated.components.schemas.AtcSearchResult;

    expect(srsItemSchema).toBeDefined();
    expect(generatedItemSchema).toBeDefined();

    const srsFields = Object.keys(srsItemSchema.properties).sort();
    const generatedFields = Object.keys(generatedItemSchema.properties).sort();

    expect(srsFields).toEqual(generatedFields);
  });

  test('SRS AtcSearchResult.status enum matches the generated Execution Status enum (includes unrun)', () => {
    const srs = readSrs();
    const generated = readGenerated();

    const srsItemSchema = getSrsSearchItemSchema(srs);
    const generatedItemSchema = generated.components.schemas.AtcSearchResult;

    const srsEnum = [...(srsItemSchema.properties.status.enum as string[])].sort();
    const generatedEnum = [...(generatedItemSchema.properties.status.enum as string[])].sort();

    expect(srsEnum).toEqual(generatedEnum);
  });

  test('SRS does not use atc_id / status_dot as ATC search response field names (the BK-187 trap)', () => {
    const srs = readSrs();
    const srsItemSchema = getSrsSearchItemSchema(srs);
    const fields = Object.keys(srsItemSchema.properties);

    expect(fields).not.toContain('atc_id');
    expect(fields).not.toContain('status_dot');
  });

  test('Tree.tree[].status_dot enum includes unrun (the schema default and the endpoint\'s most common value)', () => {
    const srs = readSrs();
    const treeStatusDot = srs.components.schemas.Tree.properties.tree.items.properties.status_dot.enum as string[];

    expect(treeStatusDot).toContain('unrun');
  });
});
