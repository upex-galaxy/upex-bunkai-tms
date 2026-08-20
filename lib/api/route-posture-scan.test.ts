import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BYPASS_POSTURE, INDIRECT_EXPORT_POSTURE, scanRoutePostures } from '@lib/api/route-posture-scan';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-542 — `scanRoutePostures` crashed the whole coverage suite instead of
// reporting the offending handler.
//
// `route-capability-coverage.test.ts` calls the scan at `describe` BODY level,
// so anything the scan throws escapes before a single `it()` is registered:
// the run reports 0 pass / 0 fail / 1 error and names no route. `postureAt`
// threw on exactly the two shapes the `WithApiHandlerOptions` union already
// rejects at compile time — a `withApiHandler(handler)` call with the options
// argument omitted, and `auth: 'required'` with no `requires` list — on the
// stated grounds that the type made them unreachable. It does not: `bun test`
// does not type-check, so any run that reaches the scan without `types:check`
// first (a reordered CI, a bypassed pre-commit hook, a cast) meets them.
//
// The fix reports both as rows the existing coverage assertions already look
// for. This suite is the regression: it drives the scan over throwaway route
// files on disk rather than over `app/api`, so it can hold the failing shapes
// without adding a broken route to the repo.
//
// Pure filesystem, no imports of the route modules and no credentials — like
// the coverage suite it guards, it always runs.

let root: string;
let apiRoot: string;

function writeRoute(relDir: string, source: string): void {
  const dir = join(apiRoot, relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'route.ts'), source);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bk542-posture-scan-'));
  apiRoot = join(root, 'app', 'api');
  mkdirSync(apiRoot, { recursive: true });

  // The regression shape: the options argument omitted entirely. Valid syntax,
  // rejected by the type union, invisible to `bun test`.
  writeRoute('v1/no-options', 'export const POST = withApiHandler(handler);\n');

  // The sibling shape: `required` with no capability list.
  writeRoute('v1/required-no-list', 'export const GET = withApiHandler(handler, { auth: \'required\' });\n');

  // Well-formed handlers, so the assertions below prove the scan still reads
  // real postures rather than degrading everything to undeclared.
  writeRoute('v1/well-formed', [
    'export const GET = withApiHandler(handler, { auth: \'required\', requires: [\'atc:read\'] });',
    'export const POST = withApiHandler(handler, { auth: \'public\', why: \'Public discovery route.\' });',
    'export const PATCH = withApiHandler(handler, { auth: \'authenticated\', why: \'Session-scoped.\' });',
  ].join('\n'));

  writeRoute('v1/bypass', 'export async function GET(request: Request) { return new Response(null); }\n');

  writeRoute('v1/indirect', 'export { impl as DELETE };\n');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function postureOf(rows: ReturnType<typeof scanRoutePostures>, file: string, method: string): string | undefined {
  return rows.find(r => r.file === `app/api/${file}/route.ts` && r.method === method)?.posture;
}

describe('BK-542 — scanRoutePostures reports undeclared handlers instead of throwing', () => {
  it('does not throw on a handler whose options argument is omitted', () => {
    // The bug: this call threw, and the throw escaped the coverage suite's
    // `describe` body. Asserting on the CALL, not on the row, is the point —
    // the row assertions below are worthless if this one regresses.
    expect(() => scanRoutePostures(apiRoot, root)).not.toThrow();
  });

  it('reports the omitted-options handler as a falsy posture', () => {
    const rows = scanRoutePostures(apiRoot, root);
    const posture = postureOf(rows, 'v1/no-options', 'POST');
    // Falsy, not absent: `it('leaves no handler without a posture')` in the
    // coverage suite filters `!row.posture`, so an omitted row would pass that
    // assertion vacuously and re-open the fail-open the scan exists to close.
    expect(posture).toBe('');
    expect(rows.filter(r => !r.posture)).toHaveLength(1);
  });

  it('reports `auth: required` with no requires list as an empty required posture', () => {
    const rows = scanRoutePostures(apiRoot, root);
    // Lands on `it('declares at least one capability wherever the posture is
    // required')`, which names the handler.
    expect(postureOf(rows, 'v1/required-no-list', 'GET')).toBe('required:');
  });

  it('still reads well-formed postures', () => {
    const rows = scanRoutePostures(apiRoot, root);
    expect(postureOf(rows, 'v1/well-formed', 'GET')).toBe('required:atc:read');
    expect(postureOf(rows, 'v1/well-formed', 'POST')).toBe('public');
    expect(postureOf(rows, 'v1/well-formed', 'PATCH')).toBe('authenticated');
  });

  it('still reads the justification off a no-capability posture', () => {
    const rows = scanRoutePostures(apiRoot, root);
    const row = rows.find(r => r.file === 'app/api/v1/well-formed/route.ts' && r.method === 'PATCH');
    expect(row?.why).toBe('Session-scoped.');
  });

  it('still classifies gateway bypassers and indirect exports', () => {
    const rows = scanRoutePostures(apiRoot, root);
    expect(postureOf(rows, 'v1/bypass', 'GET')).toBe(BYPASS_POSTURE);
    expect(postureOf(rows, 'v1/indirect', 'DELETE')).toBe(INDIRECT_EXPORT_POSTURE);
  });

  it('enumerates every handler it met, so a crash cannot masquerade as a clean scan', () => {
    const rows = scanRoutePostures(apiRoot, root);
    // 1 no-options + 1 required-no-list + 3 well-formed + 1 bypass + 1 indirect.
    expect(rows).toHaveLength(7);
  });
});
