/**
 * `jira:sync-workflows --plan-json` / `--answers` (installer-ui delivery 3, owner
 * answer Q5): the pickers become questions the installer asks in its page.
 */

import type { PlanQuestion } from './sync-jira-workflows.ts';

import { afterEach, describe, expect, test } from 'bun:test';

import { decidePick, PICKS, SKIP_ANSWER } from './sync-jira-workflows.ts';

const q: PlanQuestion = {
  id: 'story.status.in_test',
  workType: 'story',
  kind: 'status',
  slug: 'in_test',
  reason: 'missing',
  options: [{ value: '10001', label: 'In Testing (id 10001)' }, { value: SKIP_ANSWER, label: '[skip]' }],
};

afterEach(() => { PICKS.plan = null; PICKS.answers = null; });

describe('picker decisions', () => {
  test('no mode: undefined, so the script prompts as before', () => {
    expect(decidePick(q)).toBeUndefined();
  });

  test('plan mode collects the question and leaves the slug unmapped', () => {
    PICKS.plan = [];
    expect(decidePick(q)).toBe(SKIP_ANSWER);
    expect(PICKS.plan).toEqual([q]);
  });

  test('answers mode returns an offered answer; a missing or foreign one is a skip', () => {
    PICKS.answers = { 'story.status.in_test': '10001' };
    expect(decidePick(q)).toBe('10001');
    PICKS.answers = { 'story.status.in_test': '99999' };
    expect(decidePick(q)).toBe(SKIP_ANSWER);
    PICKS.answers = {};
    expect(decidePick(q)).toBe(SKIP_ANSWER);
  });
});
