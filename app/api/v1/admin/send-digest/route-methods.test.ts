import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

// BK-882 — a cron whose route does not handle the verb Vercel sends fails
// SILENTLY. There is no email, no application-visible error, and no failed
// invocation anyone would notice: the scheduler gets a 405 and moves on. That
// is exactly what shipped for BK-214, and it went unseen for over a week only
// because the story never reached the production branch, which is the only
// place Vercel registers cron definitions at all.
//
// So this guard is deliberately NOT written against the send-digest route by
// name. It reads `vercel.json` and holds EVERY declared cron to the contract,
// so the next scheduled feature cannot reintroduce the same defect.
//
// It is a source scan rather than a module import on purpose: the route
// module pulls in `server-only`, a validated `env`, and a Supabase admin
// client, none of which a unit test should need in order to answer the
// question "is this verb exported at all?".

interface VercelCron { path: string, schedule: string }

const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: VercelCron[] };
const crons = vercelConfig.crons ?? [];

// Vercel Cron issues a GET. Documented in the cron quickstart, whose handler
// is `export function GET(request)`.
const CRON_HTTP_METHOD = 'GET';

function routeFileFor(cronPath: string): string {
  return `app${cronPath}/route.ts`;
}

function exportedMethods(source: string): string[] {
  return [...source.matchAll(/^export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm)]
    .map(match => match[1]);
}

describe('vercel.json cron declarations', () => {
  test('declares at least one cron, so this guard is not vacuously green', () => {
    expect(crons.length).toBeGreaterThan(0);
  });

  test.each(crons.map(cron => [cron.path, cron.schedule] as const))(
    'cron %s (%s) points at a route module that exports GET',
    (cronPath) => {
      const file = routeFileFor(cronPath);
      let source: string;
      try {
        source = readFileSync(file, 'utf8');
      }
      catch {
        throw new Error(
          `vercel.json declares a cron on "${cronPath}" but ${file} does not exist. `
          + 'A cron pointing at a missing route 404s on every scheduled run, silently.',
        );
      }

      const methods = exportedMethods(source);
      expect(
        methods,
        `${file} exports [${methods.join(', ') || 'nothing'}]. Vercel Cron invokes "${cronPath}" with `
        + `${CRON_HTTP_METHOD}, so without a ${CRON_HTTP_METHOD} export the scheduled run gets 405 every time, `
        + 'with no email, no application-visible error, and no failed invocation to notice.',
      ).toContain(CRON_HTTP_METHOD);
    },
  );
});

describe('send-digest route entry points', () => {
  const source = readFileSync('app/api/v1/admin/send-digest/route.ts', 'utf8');

  test('exports GET for Vercel Cron and POST for the manual retry', () => {
    const methods = exportedMethods(source);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
  });

  test('routes both verbs through the gateway with the same implementation and posture', () => {
    // Both must wrap the SAME inner function, so a later edit cannot gate one
    // verb and leave the other open — on a route whose only protection is a
    // manual CRON_SECRET check, that would be an unauthenticated digest
    // trigger.
    //
    // Both must also spell `withApiHandler(` on their own export line. That is
    // not style: BK-497's posture scanner reads the export line for the
    // wrapper call, so `export const GET = someAlreadyWrappedConst` is
    // reported as `bypass`, the scanner's word for a route that never reaches
    // the gateway. The terser binding makes this route look ungated to the
    // check that exists to catch ungated routes.
    const bindingRe = /^export const (GET|POST) = withApiHandler\((\w+), \{ auth: '(\w+)' \}\);$/gm;
    const bindings = [...source.matchAll(bindingRe)].map(m => ({ verb: m[1], impl: m[2], auth: m[3] }));

    expect(
      bindings.map(b => b.verb).sort(),
      'GET and POST must each declare their own withApiHandler call on the export line',
    ).toEqual(['GET', 'POST']);
    expect(new Set(bindings.map(b => b.impl)).size, 'both verbs must wrap the same implementation').toBe(1);
    expect(new Set(bindings.map(b => b.auth)).size, 'both verbs must declare the same posture').toBe(1);
  });

  test('gates that shared handler on CRON_SECRET', () => {
    expect(source).toContain('isValidCronSecret');
  });
});
