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

const SAVE_ACTION = 'app/(app)/projects/[projectSlug]/atcs/[atcId]/actions.ts';
const EDITOR = 'components/atcs/AtcEditor.tsx';

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
    const call = actions.slice(actions.indexOf('await updateAtc(supabase, {'));
    expect(call).not.toBe('');
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
    const payload = editor.slice(editor.indexOf('const result = await onSave({'));
    expect(payload).not.toBe('');
    expect(payload).toContain('technique,');
    expect(payload).toContain('priority,');
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
