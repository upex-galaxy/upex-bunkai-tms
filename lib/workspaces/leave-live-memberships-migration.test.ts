import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

// BK-1901 — guards the shape of migration 0128 in its text, the same way
// lib/notifications/inapp-suppression-migration.test.ts guards 0107. The
// behaviour itself is proven against the real database by
// leave-live-memberships-isolation.test.ts; this file runs without a database
// and keeps the live-workspace filter, the 0118 lock and the grants from
// regressing silently in a later restatement of the function.

function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .map(line => line.replace(/\s--.*$/, ''))
    .join('\n');
}

function functionBody(code: string, name: string): string {
  const start = code.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = code.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return code.slice(start, end);
}

const read = (file: string) => withoutComments(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
const code = read('0128_leave_workspace_live_memberships.sql');
const body = functionBody(code, 'bunkai_leave_workspace');
const previous = functionBody(read('0118_member_write_paths_locked.sql'), 'bunkai_leave_workspace');

describe('0128 bunkai_leave_workspace', () => {
  it('counts only other memberships in live workspaces for last_membership', () => {
    expect(body).toMatch(/join public\.workspaces w on w\.id = wm\.workspace_id/);
    expect(body).toMatch(/and w\.deleted_at is null/);
    expect(body).toMatch(/and wm\.workspace_id <> p_workspace_id/);
    expect(body).toMatch(/if v_other_live_memberships = 0 then\s+raise exception 'last_membership' using errcode = '45212'/);
  });

  it('keeps last_membership ahead of sole_owner', () => {
    expect(body.indexOf('\'last_membership\'')).toBeGreaterThan(-1);
    expect(body.indexOf('\'last_membership\'')).toBeLessThan(body.indexOf('\'sole_owner\''));
  });

  it('changes nothing else in the 0118 body', () => {
    const normalize = (text: string) => text
      .replace(/select count\(\*\) into v_\w+\s+from public\.workspace_members[^;]*;\s+if v_\w+ (?:<= 1|= 0) then/, '<<guard>>')
      .replace(/v_(?:total_active|other_live)_memberships int;/, '<<decl>>');
    expect(normalize(body)).toBe(normalize(previous));
  });

  it('keeps the 0118 lock, SECURITY DEFINER and an empty search_path', () => {
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).toMatch(/order by wm\.user_id\s+for update;/);
    expect(body).not.toMatch(/p_actor/);
  });

  it('re-emits the 0044 grants and never revokes from authenticated', () => {
    expect(code).toMatch(/revoke execute on function public\.bunkai_leave_workspace\(uuid\) from public, anon;/);
    expect(code).toMatch(/grant execute on function public\.bunkai_leave_workspace\(uuid\) to authenticated;/);
    expect(code).not.toMatch(/revoke [^;]*from [^;]*authenticated/);
  });

  it('rewrites no membership row', () => {
    expect(code).not.toMatch(/update public\.workspace_members/);
    expect(code).not.toMatch(/insert into public\.workspace_members/);
  });
});
