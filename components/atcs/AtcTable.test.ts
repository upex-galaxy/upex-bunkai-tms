import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';
import {
  ATC_LIST_EMPTY_DESCRIPTION_CAN_CREATE,
  ATC_LIST_EMPTY_DESCRIPTION_READ_ONLY,
  ATC_LIST_EMPTY_HINT,
} from './AtcTable';

// BK-883 — the ATC table's never-had-any state kept telling users the ATC
// builder "ships next sprint" long after BK-19 shipped it. This repo has no
// component/DOM render harness (see `lib/atcs/duplicate-client.test.ts`), and
// stubbing `next/navigation` with `mock.module` leaks into every other test
// file in the same `bun test` process, so the copy is asserted through the
// exported constants the component renders, plus a guard over the source so
// the stale phrase cannot come back as an inline string either.

describe('AtcTable empty-state copy (BK-883)', () => {
  it('points at the live ATC builder, never at a future sprint', () => {
    for (const copy of [ATC_LIST_EMPTY_HINT, ATC_LIST_EMPTY_DESCRIPTION_CAN_CREATE, ATC_LIST_EMPTY_DESCRIPTION_READ_ONLY]) {
      expect(copy.toLowerCase()).not.toContain('next sprint');
    }
    expect(ATC_LIST_EMPTY_HINT).toContain('ATC builder');
    expect(ATC_LIST_EMPTY_DESCRIPTION_CAN_CREATE).toContain('ATC builder');
  });

  it('keeps the read-only copy free of a call to action a viewer cannot follow', () => {
    expect(ATC_LIST_EMPTY_DESCRIPTION_READ_ONLY.toLowerCase()).not.toContain('create');
  });

  it('has no "next sprint" string left anywhere in the component source', () => {
    const source = readFileSync(new URL('./AtcTable.tsx', import.meta.url), 'utf8');
    expect(source.toLowerCase()).not.toContain('next sprint');
    expect(source).toContain('data-testid="atc-list-empty-new-atc"');
    expect(source).toContain('/atcs/new');
  });
});
