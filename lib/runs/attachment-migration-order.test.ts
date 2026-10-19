import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

// BK-593 review F3 - a caller who is not a member of the owning workspace must never queue a
// row lock on a foreign Run. Postgres cannot show that from a PostgREST client (no way to hold
// a transaction open), so this guards the order inside the migration text: in each writer the
// first `for update` comes after the membership check. The behaviour on the answers (P0002 /
// 42501 / 45216) is covered against the real database in step-attachments-isolation.test.ts.

const sql = readFileSync(new URL('../../supabase/migrations/0097_run_step_attachments.sql', import.meta.url), 'utf8');

function body(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('\n$$;', start);
  return sql.slice(start, end);
}

describe('0097 writers authorize before they lock', () => {
  for (const name of ['bunkai_init_run_step_attachment', 'bunkai_commit_run_step_attachment', 'bunkai_remove_run_step_attachment']) {
    it(`${name} checks membership before the first for update`, () => {
      const text = body(name).split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
      const member = text.indexOf('bunkai_is_workspace_member');
      const lock = text.indexOf('for update');
      expect(member).toBeGreaterThan(-1);
      expect(lock).toBeGreaterThan(-1);
      expect(member).toBeLessThan(lock);
    });
  }
});
