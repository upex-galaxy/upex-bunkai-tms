import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

// BK-594 - guards on the text of migration 0131 that a PostgREST client cannot observe:
//   * each upload writer authorizes before it takes any lock (a non-member never queues one);
//   * the copy-forward of bunkai_create_bug keeps every 0046 check, the 45303 backstop
//     included, so the shared cap is not weakened or routed around;
//   * the old eleven-argument signature is dropped (no PostgREST overload), and the read-only
//     QA role is revoked on every new writer.
// The behaviour behind these answers is lib/bugs/evidence-isolation.test.ts.

const sql = readFileSync(new URL('../../supabase/migrations/0131_bug_evidence_attachments.sql', import.meta.url), 'utf8');
const code = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');

function body(name: string): string {
  const start = code.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = code.indexOf('\n$$;', start);
  return code.slice(start, end);
}

describe('0131 writers authorize before they lock', () => {
  for (const name of ['bunkai_init_bug_evidence', 'bunkai_commit_bug_evidence', 'bunkai_discard_bug_evidence']) {
    it(`${name} checks membership before the first lock`, () => {
      const text = body(name);
      const member = text.indexOf('bunkai_is_workspace_member');
      const locks = [text.indexOf('for update'), text.indexOf('pg_advisory_xact_lock')].filter(i => i > -1);
      expect(member).toBeGreaterThan(-1);
      expect(locks.length).toBeGreaterThan(0);
      expect(member).toBeLessThan(Math.min(...locks));
    });
  }
});

describe('0131 bunkai_create_bug keeps every 0046 check', () => {
  const text = body('bunkai_create_bug');

  it.each(['P0002', '45300', '45301', '45302', '45303', '45305', '45306', '45307'])('still raises %s', (errcode) => {
    expect(text).toContain(`errcode = '${errcode}'`);
  });

  it('keeps the actor bind and the write-project authorization', () => {
    expect(text).toContain('auth.uid() is not null and auth.uid() <> p_actor_user_id');
    expect(text).toContain('bunkai_assert_actor_can_write_project(p_actor_user_id, p_project_id)');
  });

  it('counts links and uploads together, and claims only the actor\'s own committed, unclaimed, unexpired uploads', () => {
    expect(text).toContain('v_total := v_links + v_uploads');
    expect(text).toMatch(/if v_total > 10 then\s+raise exception 'bug_evidence_limit_exceeded' using errcode = '45303'/);
    for (const clause of ['a.created_by = p_actor_user_id', 'a.workspace_id = v_workspace_id', 'a.project_id = p_project_id', 'a.status = \'committed\'', 'a.bug_id is null', 'a.expires_at > now()', 'for update']) {
      expect(text).toContain(clause);
    }
  });

  it('drops the old signature so only one overload exists, with defaults for the new arguments', () => {
    expect(code).toContain('drop function if exists public.bunkai_create_bug(\n  uuid, uuid, uuid, text, text, text, text, text[], uuid, uuid, uuid\n);');
    expect(text).toContain('p_evidence_attachment_ids uuid[] default null');
    expect(text).toContain('p_evidence_order          int[]  default null');
  });

  it('leaves the evidence_urls CHECK of 0046 untouched', () => {
    expect(code).not.toMatch(/alter table public\.bugs/i);
  });
});

describe('0131 grants', () => {
  it.each([
    'bunkai_create_bug(\n      uuid, uuid, uuid, text, text, text, text, text[], uuid, uuid, uuid, uuid[], int[]\n    ) from qa_inspector_ro',
    'bunkai_init_bug_evidence(uuid, uuid, text, text, bigint) from qa_inspector_ro',
    'bunkai_commit_bug_evidence(uuid, bigint) from qa_inspector_ro',
    'bunkai_discard_bug_evidence(uuid) from qa_inspector_ro',
    'bunkai_expire_bug_evidence(int) from qa_inspector_ro',
  ])('revokes the read-only QA role: %s', (fragment) => {
    expect(code).toContain(`revoke all on function public.${fragment}`);
  });

  it('keeps the sweep helper to service_role', () => {
    expect(code).toContain('revoke execute on function public.bunkai_expire_bug_evidence(int) from public, anon, authenticated;');
  });

  it('is ASCII only (the apply ledger once lost a literal NBSP)', () => {
    expect([...sql].every(ch => ch.charCodeAt(0) < 128)).toBe(true);
  });
});
