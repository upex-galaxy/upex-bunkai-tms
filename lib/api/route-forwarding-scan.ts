// Structural reader for the object literal a route hands to an RPC wrapper.
//
// THE DEFECT CLASS IT EXISTS FOR. A request field can be declared in a Zod
// schema, parsed by the route, and then never forwarded to the RPC — or, worse,
// forwarded onto the WRONG argument. Nothing fails: the schema accepts the
// value, the route returns its usual 2xx, and the caller gets a plausible wrong
// answer with no signal. A substring scan over the call site does not catch the
// second half of that: `technique: query.priority, priority: query.technique`
// contains both `query.technique` and `query.priority` and passes any
// "does the source mention it" check.
//
// So this module does not search — it PARSES. It brace-matches the object
// literal passed to the call, splits it on top-level commas, and returns
// `argument name -> value expression as written`. The caller can then assert the
// PAIR (which argument reads which parsed field), which is the property that
// actually matters.
//
// A SOURCE SCAN, deliberately, for the reason `route-posture-scan.ts` states in
// its own header: importing a route module pulls `server-only`, the Supabase
// clients and the env schema into the test process, and intercepting the RPC
// would need `mock.module`, which in Bun is PROCESS-GLOBAL — a module mock
// installed in one file leaks into every later file in the run. A scan has no
// dependencies, no database and no mocks, so it always runs and can never
// contaminate anything.
//
// SCOPE. This is a pragmatic parser for the one shape it is pointed at: a call
// whose second argument is an object literal of `name: expression` properties.
// It understands comments, string and template literals, and nesting. It does
// NOT understand regex literals (an unbalanced brace inside one, before the
// closing brace of the scanned literal, would confuse the matcher) — no route
// scanned today puts one there, and a malformed extraction throws by name
// rather than passing.

// Replace the CONTENT of comments, strings and template literals with spaces,
// preserving length so every index computed on the mask also addresses the
// original. Structural scanning (brace matching, comma splitting) runs on the
// mask; the values handed back are sliced from the original.
export function maskNonCode(source: string): string {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        out += ' ';
        index += 1;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      out += '  ';
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        out += source[index] === '\n' ? '\n' : ' ';
        index += 1;
      }
      if (index < source.length) {
        out += '  ';
        index += 2;
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      out += char;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\' && index + 1 < source.length) {
          out += '  ';
          index += 2;
          continue;
        }
        if (source[index] === char) {
          out += char;
          index += 1;
          break;
        }
        out += source[index] === '\n' ? '\n' : ' ';
        index += 1;
      }
      continue;
    }

    out += char;
    index += 1;
  }
  return out;
}

export interface CallArgumentObject {
  /** The object literal as written, braces included. */
  source: string
  /** Argument name -> the value expression as written, trimmed. */
  properties: Map<string, string>
  /** Shorthand (`technique,`) and spread (`...rest`) entries, verbatim. */
  unnamed: string[]
}

// Extract and parse the object literal passed to `<callExpression>`, e.g.
// `await searchAtcs(`. Throws — by name — when the call is absent or the
// literal cannot be matched, so a route refactor that moves the call surfaces
// as a loud failure instead of a silently empty scan.
export function callArgumentObject(source: string, callExpression: string): CallArgumentObject {
  const masked = maskNonCode(source);

  const callIndex = masked.indexOf(callExpression);
  if (callIndex === -1) {
    throw new Error(`[route-forwarding-scan] no \`${callExpression}\` found in the scanned source — the scan is looking at the wrong thing.`);
  }
  const open = masked.indexOf('{', callIndex);
  if (open === -1) {
    throw new Error(`[route-forwarding-scan] \`${callExpression}\` is called without an object literal.`);
  }

  let depth = 0;
  let close = -1;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === '{') { depth += 1; }
    if (masked[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (close === -1) {
    throw new Error(`[route-forwarding-scan] unbalanced braces in the \`${callExpression}\` call.`);
  }

  const properties = new Map<string, string>();
  const unnamed: string[] = [];
  for (const [start, end] of topLevelEntries(masked, open + 1, close)) {
    const raw = source.slice(start, end);
    const maskedEntry = masked.slice(start, end);
    if (maskedEntry.trim() === '') { continue; }

    const colon = firstTopLevelColon(maskedEntry);
    if (colon === -1) {
      unnamed.push(raw.trim());
      continue;
    }
    const name = maskedEntry.slice(0, colon).trim();
    // Computed keys (`[k]: v`) have no static name to assert on.
    if (!/^[A-Z_$][\w$]*$/i.test(name)) {
      unnamed.push(raw.trim());
      continue;
    }
    properties.set(name, raw.slice(colon + 1).trim());
  }

  return { source: source.slice(open, close + 1), properties, unnamed };
}

// [start, end) index pairs for each comma-separated entry between `from` and
// `to`, splitting only on commas that sit outside every bracket pair.
function topLevelEntries(masked: string, from: number, to: number): [number, number][] {
  const entries: [number, number][] = [];
  let depth = 0;
  let start = from;
  for (let index = from; index < to; index += 1) {
    const char = masked[index];
    if (char === '{' || char === '(' || char === '[') { depth += 1; }
    else if (char === '}' || char === ')' || char === ']') { depth -= 1; }
    else if (char === ',' && depth === 0) {
      entries.push([start, index]);
      start = index + 1;
    }
  }
  entries.push([start, to]);
  return entries;
}

function firstTopLevelColon(entry: string): number {
  let depth = 0;
  for (let index = 0; index < entry.length; index += 1) {
    const char = entry[index];
    if (char === '{' || char === '(' || char === '[') { depth += 1; }
    else if (char === '}' || char === ')' || char === ']') { depth -= 1; }
    else if (char === ':' && depth === 0) { return index; }
  }
  return -1;
}

// `project_id` -> `projectId`. The wrappers rename request fields to camelCase
// on the way in, so the expected argument name is derivable from the schema key
// rather than hand-listed; only genuine abbreviations need an explicit alias.
export function camelCase(snake: string): string {
  return snake.replace(/_([a-z0-9])/gi, (_, char: string) => char.toUpperCase());
}

// Does `expression` read exactly `<object>.<field>`, on a word boundary? Word
// boundaries matter: `body.title` must not be satisfied by `body.title_draft`.
export function readsField(expression: string | undefined, object: string, field: string): boolean {
  if (expression === undefined) { return false; }
  return new RegExp(String.raw`\b${object}\.${field}\b`).test(expression);
}
