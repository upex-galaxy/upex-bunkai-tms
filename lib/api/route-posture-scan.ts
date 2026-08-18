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

export interface RouteHandlerPosture {
  // Repo-relative, forward-slashed, e.g. `app/api/v1/atcs/route.ts`.
  file: string
  method: string
  // `public` | `cookie-only` | `authenticated` | `required:<cap>,<cap>` | `bypass`
  posture: string
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export function scanRoutePostures(apiRoot: string, repoRoot: string): RouteHandlerPosture[] {
  const out: RouteHandlerPosture[] = [];
  for (const file of collectRouteFiles(apiRoot)) {
    const source = readFileSync(file, 'utf8');
    const relPath = relative(repoRoot, file).split(sep).join('/');
    for (const found of extractHandlers(source)) {
      out.push({ file: relPath, method: found.method, posture: found.posture });
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
    else if (entry === 'route.ts') {
      out.push(full);
    }
  }
  return out.sort();
}

function extractHandlers(source: string): { method: string, posture: string }[] {
  const found: { method: string, posture: string }[] = [];
  // Matches all three export forms a Next route handler can take:
  //   export const GET = ...      export function GET(      export async function GET(
  const exportRe = /^export\s+(?:const\s+([A-Z]+)\s*=|(?:async\s+)?function\s+([A-Z]+)\s*\()/gm;

  let match = exportRe.exec(source);
  while (match !== null) {
    const method = match[1] ?? match[2];
    if (HTTP_METHODS.has(method)) {
      found.push({ method, posture: postureAt(source, match.index) });
    }
    match = exportRe.exec(source);
  }
  return found;
}

// Read the posture of the handler whose `export` starts at `exportStart`.
function postureAt(source: string, exportStart: number): string {
  const callToken = 'withApiHandler(';
  // The wrapper call, when present, is the first thing on the export line.
  const lineEnd = source.indexOf('\n', exportStart);
  const declLine = source.slice(exportStart, lineEnd === -1 ? source.length : lineEnd);
  if (!declLine.includes(callToken)) {
    return BYPASS_POSTURE;
  }

  const openParen = source.indexOf(callToken, exportStart) + callToken.length - 1;
  const closeParen = matchingParen(source, openParen);
  if (closeParen === -1) {
    throw new Error(`Unbalanced withApiHandler( call at offset ${exportStart}`);
  }

  const args = source.slice(openParen + 1, closeParen);
  const auth = /\bauth\s*:\s*'([a-z-]+)'/.exec(args);
  if (!auth) {
    // Only reachable if the union were widened or bypassed with a cast; the
    // type makes the ordinary path impossible.
    throw new Error(`withApiHandler call at offset ${exportStart} declares no auth posture`);
  }
  if (auth[1] !== 'required') {
    return auth[1];
  }

  const requires = /\brequires\s*:\s*\[([^\]]*)\]/.exec(args);
  if (!requires) {
    throw new Error(`auth: 'required' at offset ${exportStart} declares no requires list`);
  }
  const caps = [...requires[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  return `required:${caps.join(',')}`;
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
