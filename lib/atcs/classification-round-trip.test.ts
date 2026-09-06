import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ATC_PRIORITIES, ATC_TECHNIQUES } from '@lib/atcs/validation';
import { describe, expect, it } from 'bun:test';

// BK-399 — THE DATA-LOSS GUARD.
//
// `bunkai_update_atc` (migration 0087) writes `technique = p_technique,
// priority = p_priority` UNCONDITIONALLY, and both parameters are
// `text default null`. That is correct for the ratified full-replace contract
// and catastrophic for any caller that forgets to send them: the web editor's
// save would NULL a classification the user set through the API, bump
// `version`, and emit `atc.updated` — silently, with no error and no visual
// cue that anything was dropped.
//
// The editor -> server-action leg is guarded by the TYPE SYSTEM: `AtcSaveInput`
// and `SaveAtcActionInput` both declare `technique` / `priority` as REQUIRED
// keys holding a nullable value, so omitting either at a call site is a
// compile error (`bun run types:check`), not a runtime surprise.
//
// The server-action -> RPC leg cannot be typed shut the same way: `UpdateAtcArgs`
// must keep both optional so PAT/API callers that legitimately omit them still
// compile. So it is guarded HERE, by scanning the source. A source scan is
// deliberate: driving `saveAtcAction` for real would need `mock.module`, which
// is process-global in Bun and leaks into every later file of the run (a
// previous slice broke 17 unrelated suites that way).
//
// Delete `technique: input.technique` from the RPC call and this suite fails.

const repoRoot = join(import.meta.dir, '..', '..');

function source(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

// The object literal that follows `marker`, brace-matched to its own closing
// brace.
//
// `source.slice(source.indexOf(marker))` — what this used to do — slices to the
// END OF FILE, so the "payload" it asserts on is every remaining line of the
// module. Any later mention of the forwarded key satisfies it: a destructuring
// below the call site, a comment quoting the line, an unrelated object with a
// `technique` field. The guard then passes with the forwarding deleted, which is
// precisely the failure it was written to catch. Matching the braces bounds the
// assertion to the literal actually being sent.
function objectLiteralAfter(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at === -1) {
    throw new Error(`[classification-round-trip] \`${marker}\` not found — the scan is looking at the wrong thing, or the call site moved.`);
  }
  const open = source.indexOf('{', at + marker.length - 1);
  if (open === -1) {
    throw new Error(`[classification-round-trip] \`${marker}\` is not followed by an object literal.`);
  }
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') { depth += 1; }
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) { return source.slice(open, index + 1); }
    }
  }
  throw new Error(`[classification-round-trip] unbalanced braces after \`${marker}\`.`);
}

const SAVE_ACTION = 'app/(app)/projects/[projectSlug]/atcs/[atcId]/actions.ts';
const EDITOR = 'components/atcs/AtcEditor.tsx';
const NEW_EDITOR = 'components/atcs/NewAtcEditor.tsx';

describe('aTC classification save round-trip', () => {
  const actions = source(SAVE_ACTION);

  it('declares both classification fields as required keys on the action input', () => {
    // Required, not optional: `technique?:` would let a call site drop the key
    // and still type-check, which is exactly the failure this guards.
    expect(actions).toContain('technique: AtcTechnique | null');
    expect(actions).toContain('priority: AtcPriority | null');
    expect(actions).not.toContain('technique?: AtcTechnique');
    expect(actions).not.toContain('priority?: AtcPriority');
  });

  it('forwards both fields from the action input into the update RPC call', () => {
    const call = objectLiteralAfter(actions, 'await updateAtc(supabase, {');
    expect(call).toContain('technique: input.technique');
    expect(call).toContain('priority: input.priority');
  });

  it('never hardcodes a cleared classification on the save path', () => {
    // A literal null here would clear on every save just as effectively as an
    // omission, while looking deliberate in review.
    expect(actions).not.toContain('technique: null');
    expect(actions).not.toContain('priority: null');
  });
});

describe('aTC editor classification state', () => {
  const editor = source(EDITOR);

  it('seeds both controls from the LOADED ATC, not from a blank default', () => {
    // `useState(null)` here is the same data-loss bug wearing a different hat:
    // the editor would render "Not specified" over a real stored value and then
    // write that back on save.
    expect(editor).toContain('useState<AtcTechnique | null>(atc.technique)');
    expect(editor).toContain('useState<AtcPriority | null>(atc.priority)');
  });

  it('sends both fields on every save', () => {
    const payload = objectLiteralAfter(editor, 'const result = await onSave({');
    expect(payload).toContain('technique,');
    expect(payload).toContain('priority,');
  });
});

// THE CREATE PATH — the same defect, previously unguarded on BOTH legs.
//
// The POST body was an untyped inline object inside `JSON.stringify({…})`, so
// there was no required-key type to violate; and the scan above reads only
// `actions.ts` and `AtcEditor.tsx`, so it never looked here. Deleting
// `technique,` / `priority,` from that literal compiled, linted and passed every
// test in the chain — while every ATC created through the web editor stored NULL
// for a classification its author had picked and watched render in the preview.
// `AtcCreateBodySchema` defaults both to null, so the server answers 201 and
// nothing anywhere reports a loss.
//
// Both legs are closed the way the update path closes them: a declared body type
// whose classification keys are REQUIRED and nullable (omission is a
// `types:check` failure), and this scan over the literal that is actually sent.
describe('aTC create editor classification payload', () => {
  const editor = source(NEW_EDITOR);

  it('declares both classification fields as required keys on the POST body type', () => {
    // Required, not optional: `technique?:` would let the literal drop the key
    // and still type-check, which is exactly the failure this guards.
    expect(editor).toContain('technique: AtcTechnique | null');
    expect(editor).toContain('priority: AtcPriority | null');
    expect(editor).not.toContain('technique?: AtcTechnique');
    expect(editor).not.toContain('priority?: AtcPriority');
  });

  it('binds the POST body to that type, so a dropped key fails types:check', () => {
    // Without the binding the declaration is decoration: an untyped object
    // literal satisfies no interface, however carefully the interface is
    // written.
    const payload = objectLiteralAfter(editor, 'body: JSON.stringify({');
    expect(editor.slice(editor.indexOf('body: JSON.stringify({')))
      .toContain(`${payload} satisfies NewAtcRequestBody`);
  });

  it('sends both fields in the POST body', () => {
    const payload = objectLiteralAfter(editor, 'body: JSON.stringify({');
    expect(payload).toContain('technique,');
    expect(payload).toContain('priority,');
  });

  it('never hardcodes a cleared classification in the POST body', () => {
    // A literal null here would ship "not specified" over the user's choice just
    // as effectively as an omission, while looking deliberate in review. (The
    // `useState(null)` seeds are correct on this path — a NEW ATC does start
    // unclassified — so the assertion is scoped to the payload, not the file.)
    const payload = objectLiteralAfter(editor, 'body: JSON.stringify({');
    expect(payload).not.toContain('technique: null');
    expect(payload).not.toContain('priority: null');
  });
});

// The `lib/types.ts` literal unions are restated by hand (that module is a
// dependency-free entity-shape stub, and importing the zod-backed validation
// module into it would drag zod into every client component's graph). This is
// the guard that keeps the restatement honest: add a technique to the API enum
// without adding it to the union and the union stops being able to express a
// value the database will happily store.
describe('classification unions stay in step with the API enums', () => {
  const types = source('lib/types.ts');

  it('lists every technique in the AtcTechnique union', () => {
    for (const technique of ATC_TECHNIQUES) {
      expect(types).toContain(`'${technique}'`);
    }
  });

  it('lists every priority in the AtcPriority union', () => {
    const union = types.slice(types.indexOf('export type AtcPriority'));
    for (const priority of ATC_PRIORITIES) {
      expect(union).toContain(`'${priority}'`);
    }
  });
});
