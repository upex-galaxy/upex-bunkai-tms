import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Filesystem inventory of every exported route handler under `app/api` and the
// auth posture it declares.
//
// This is the detect half of the prevent/detect pair that keeps the capability
// gap closed. The prevent half is the `WithApiHandlerOptions` union in
// `lib/api/handler.ts`: a handler that declares no posture does not compile. The
// union alone, though, cannot say anything about a handler that never reaches
// the gateway — a bare `export function GET` is invisible to it. So this scan
// reads the source and the companion test diffs the result against a committed
// snapshot, which makes the full inventory reviewable in one file and turns a
// new route into a failing test rather than a silent addition.
//
// Deliberately a source scan and not an import of the route modules: importing
// them pulls `server-only`, the Supabase clients and the env schema into the
// test process, which is exactly the machinery that makes the other auth suites
// credential-gated. This scan has no dependencies and always runs.

// A handler that does not route through `withApiHandler` at all. Enumerated
// rather than skipped: a snapshot that silently omitted them would claim a
// completeness it does not have — the same fail-open shape the union closes.
export const BYPASS_POSTURE = 'bypass';

// A handler exported through an alias (`export { impl as GET }`) or as a
// default. The scan cannot resolve what such a form wraps without following the
// binding, so it refuses to guess and reports the form itself. That makes the
// route fail the snapshot and the bypasser assertion rather than disappearing
// from the inventory — silence here would be the fail-open this file exists to
// prevent, since neither the type union nor the scan would see the handler.
export const INDIRECT_EXPORT_POSTURE = 'indirect-export';

export interface RouteHandlerPosture {
  // Repo-relative, forward-slashed, e.g. `app/api/v1/atcs/route.ts`.
  file: string
  method: string
  // `public` | `cookie-only` | `authenticated` | `required:<cap>,<cap>`
  // | `bypass` | `indirect-export`
  posture: string
  // The mandatory justification on the no-capability postures, so the test can
  // assert per handler instead of grepping the whole file.
  why?: string
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const ROUTE_FILE = /^route\.(?:m|c)?[jt]sx?$/;

export function scanRoutePostures(apiRoot: string, repoRoot: string): RouteHandlerPosture[] {
  const out: RouteHandlerPosture[] = [];
  for (const file of collectRouteFiles(apiRoot)) {
    const source = readFileSync(file, 'utf8');
    const relPath = relative(repoRoot, file).split(sep).join('/');
    for (const found of extractHandlers(source)) {
      out.push({
        file: relPath,
        method: found.method,
        posture: found.posture,
        ...(found.why === undefined ? {} : { why: found.why }),
      });
    }
  }
  // Stable ordering so the snapshot diff is meaningful rather than incidental.
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.method.localeCompare(b.method));
}

function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectRouteFiles(full));
    }
    // Next accepts route.ts/tsx/js/jsx/mjs/cjs. Matching only `route.ts` would
    // let a handler in a sibling extension skip the inventory entirely.
    else if (ROUTE_FILE.test(entry)) {
      out.push(full);
    }
  }
  return out.sort();
}

interface FoundHandler { method: string, posture: string, why?: string }

function extractHandlers(source: string): FoundHandler[] {
  const found: FoundHandler[] = [];

  // Direct forms:
  //   export const GET = ...      export function GET(      export async function GET(
  const directRe = /^export\s+(?:const\s+([A-Z]+)\s*=|(?:async\s+)?function\s+([A-Z]+)\s*\()/gm;
  let match = directRe.exec(source);
  while (match !== null) {
    const method = match[1] ?? match[2];
    if (HTTP_METHODS.has(method)) {
      found.push({ method, ...postureAt(source, match.index) });
    }
    match = directRe.exec(source);
  }

  // Indirect forms: `export { impl as GET, other as POST }` / `export { GET }`.
  // Reported rather than resolved — see INDIRECT_EXPORT_POSTURE.
  const braceRe = /^export\s*\{([^}]*)\}/gm;
  let brace = braceRe.exec(source);
  while (brace !== null) {
    for (const clause of brace[1].split(',')) {
      // `impl as GET` exports GET; a bare `GET` exports GET.
      const parts = clause.trim().split(/\s+as\s+/);
      const exported = (parts.at(-1) ?? '').trim();
      if (HTTP_METHODS.has(exported)) {
        found.push({ method: exported, posture: INDIRECT_EXPORT_POSTURE });
      }
    }
    brace = braceRe.exec(source);
  }

  return found;
}

// Read the posture of the handler whose `export` starts at `exportStart`.
function postureAt(source: string, exportStart: number): { posture: string, why?: string } {
  const callToken = 'withApiHandler(';
  // The wrapper call, when present, is the first thing on the export line.
  const lineEnd = source.indexOf('\n', exportStart);
  const declLine = source.slice(exportStart, lineEnd === -1 ? source.length : lineEnd);
  if (!declLine.includes(callToken)) {
    return { posture: BYPASS_POSTURE };
  }

  const openParen = source.indexOf(callToken, exportStart) + callToken.length - 1;
  const closeParen = matchingParen(source, openParen);
  if (closeParen === -1) {
    throw new Error(`Unbalanced withApiHandler( call at offset ${exportStart}`);
  }

  // Read ONLY the options argument — the last top-level argument of the call.
  // Scanning the whole span would let an `auth: '...'` inside a comment or a
  // string in the HANDLER BODY win over the real declaration, which reports a
  // posture the route does not have. `app/api/v1/bugs/route.ts` already carries
  // a comment of exactly that shape.
  const options = lastTopLevelArgument(source.slice(openParen + 1, closeParen));

  const auth = /\bauth\s*:\s*'([a-z-]+)'/.exec(options);
  if (!auth) {
    // Only reachable if the union were widened or bypassed with a cast; the
    // type makes the ordinary path impossible.
    throw new Error(`withApiHandler call at offset ${exportStart} declares no auth posture`);
  }

  const whyMatch = /\bwhy\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/.exec(options);
  const why = whyMatch ? whyMatch[2].replace(/\\'/g, '\'').replace(/\\\\/g, '\\') : undefined;

  if (auth[1] !== 'required') {
    return { posture: auth[1], ...(why === undefined ? {} : { why }) };
  }

  const requires = /\brequires\s*:\s*\[([^\]]*)\]/.exec(options);
  if (!requires) {
    throw new Error(`auth: 'required' at offset ${exportStart} declares no requires list`);
  }
  const caps = [...requires[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  return { posture: `required:${caps.join(',')}` };
}

// The substring after the last comma that sits at nesting depth 0 — i.e. the
// final argument of the call. Strings and comments are skipped so a comma
// inside either does not split the arguments.
function lastTopLevelArgument(args: string): string {
  let depth = 0;
  let lastComma = -1;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];

    if (ch === '/' && args[i + 1] === '/') {
      const nl = args.indexOf('\n', i);
      i = nl === -1 ? args.length : nl;
      continue;
    }
    if (ch === '/' && args[i + 1] === '*') {
      const end = args.indexOf('*/', i + 2);
      i = end === -1 ? args.length : end + 1;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      const end = endOfStringLiteral(args, i);
      i = end === -1 ? args.length : end;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    }
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
    }
    else if (ch === ',' && depth === 0) {
      lastComma = i;
    }
  }
  return stripComments(args.slice(lastComma + 1));
}

// Remove comments so a commented-out posture inside the options object itself
// cannot be read as the declaration.
function stripComments(segment: string): string {
  let out = '';
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === '/' && segment[i + 1] === '/') {
      const nl = segment.indexOf('\n', i);
      if (nl === -1) {
        break;
      }
      i = nl - 1;
      continue;
    }
    if (ch === '/' && segment[i + 1] === '*') {
      const end = segment.indexOf('*/', i + 2);
      if (end === -1) {
        break;
      }
      i = end + 1;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      const end = endOfStringLiteral(segment, i);
      if (end === -1) {
        break;
      }
      out += segment.slice(i, end + 1);
      i = end;
      continue;
    }
    out += ch;
  }
  return out;
}

// Paren matcher that ignores parens inside strings, template literals, regexes-
// as-strings, and comments. A plain depth counter is not enough here: handler
// bodies are full of `'(' `, URLs, and `// (see ADR-0001)` comments.
function matchingParen(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];

    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      if (nl === -1) {
        return -1;
      }
      i = nl;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) {
        return -1;
      }
      i = end + 1;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      i = endOfStringLiteral(source, i);
      if (i === -1) {
        return -1;
      }
      continue;
    }

    if (ch === '(') {
      depth++;
    }
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

// Index of the closing quote of the literal opening at `start`, honouring
// backslash escapes. Template-literal `${}` interpolations are not walked: no
// route file nests an unbalanced paren inside one, and treating the whole
// literal as opaque is the conservative reading.
function endOfStringLiteral(source: string, start: number): number {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') {
      i++;
      continue;
    }
    if (source[i] === quote) {
      return i;
    }
  }
  return -1;
}
