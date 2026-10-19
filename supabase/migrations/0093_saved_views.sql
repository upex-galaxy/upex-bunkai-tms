-- Migration: 0093 — saved views: several NAMED views per person, project and
-- surface (BK-443)
-- Authored: 2026-10-15
--
-- `user_view_state` (0009) allows exactly one row per (user_id, project_id,
-- view_kind) and has no name, so it models "the last state of this view", not
-- "several named views of it". Nothing in app/, components/ or lib/ reads it,
-- so it is reshaped in place rather than leaving a second, overlapping table.
--
-- Decisions (AI Tech Lead, BK-443 Jira comments of 2026-10-15):
--   * Invariants live in the database, not in the route: the table is directly
--     writable through PostgREST under RLS, so uniqueness, the cap, the name
--     rules and ownership cannot depend on a client having run validation.
--   * No SECURITY DEFINER function and no identity parameter anywhere:
--     access is plain table CRUD through the caller's RLS client plus two
--     SECURITY INVOKER triggers. The actor bind is the policy
--     `user_id = auth.uid()` (ADR-0012 §"delete the parameter").
--   * Per-surface state shape (which keys a bugs view may hold) stays in the
--     route's Zod schema; a malformed own row can only hurt its owner and
--     restore ignores unknown keys.
--
-- Safe to re-run: every step is guarded. Rows that predate this file are
-- handled in two ways, decided up front:
--   * a row the new rules can never hold (a `view_kind` outside the four
--     surfaces, a `state` that is not a non-empty object, or one over 4096
--     bytes) is DELETED in step 0 before the CHECK constraints are added.
--     Nothing in app/, components/ or lib/ ever read or wrote this table, so
--     such a row is unreachable by the product and cannot be repaired into a
--     meaningful view; keeping it would make the CONSTRAINT step fail and
--     block the migration.
--   * every other row is backfilled with a name before `name` becomes
--     NOT NULL (unique by construction, because the old key allowed one row
--     per surface).
--
-- Names are NFC-normalised by the API (SavedViewNameSchema) so that NFC and
-- NFD spellings of the same text collide on `name_key`. SQL does not
-- normalise: a direct PostgREST write bypasses that, and the unique index then
-- treats two Unicode-equivalent spellings as different names. That is accepted
-- (owner-only data, no cross-user effect); the API is the supported path.

-- ---------------------------------------------------------------------------
-- 0. Rows the new rules cannot hold
-- ---------------------------------------------------------------------------
delete from public.user_view_state
where view_kind not in ('traceability', 'run_history', 'bugs', 'workbench')
   or jsonb_typeof(state) <> 'object'
   or state = '{}'::jsonb
   or octet_length(state::text) > 4096;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.user_view_state
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.user_view_state
  add column if not exists created_at timestamptz not null default now();

alter table public.user_view_state
  add column if not exists name text;

update public.user_view_state set name = 'Saved view' where name is null;

alter table public.user_view_state
  alter column name set not null;

-- The case-folded comparison key. A stored generated column (not an expression
-- index alone) so the list can ORDER BY it and the unique index below stays a
-- plain column index.
alter table public.user_view_state
  add column if not exists name_key text generated always as (lower(btrim(name))) stored;

-- The caller's own id is the default owner. Policies still require
-- `user_id = auth.uid()`, so an explicit foreign value is refused, not merged.
alter table public.user_view_state
  alter column user_id set default auth.uid();

-- A view with nothing in it is not a view (AC-10); the CHECK below refuses an
-- empty object, so an omitted `state` must fail NOT NULL instead of defaulting.
alter table public.user_view_state
  alter column state drop default;

-- ---------------------------------------------------------------------------
-- 2. Primary key: (user_id, project_id, view_kind) -> id
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.user_view_state'::regclass
      and c.conname = 'user_view_state_pkey'
      and pg_get_constraintdef(c.oid) like 'PRIMARY KEY (user_id, project_id, view_kind)%'
  ) then
    alter table public.user_view_state drop constraint user_view_state_pkey;
    alter table public.user_view_state add constraint user_view_state_pkey primary key (id);
  end if;
end
$$;

-- Name uniqueness per person, project and surface, case-insensitive and
-- trim-insensitive. It also backs the list query (ordered by name_key).
create unique index if not exists user_view_state_name_key_idx
  on public.user_view_state (user_id, project_id, view_kind, name_key);

-- ---------------------------------------------------------------------------
-- 3. Row rules
-- ---------------------------------------------------------------------------
alter table public.user_view_state
  drop constraint if exists user_view_state_view_kind_check;
alter table public.user_view_state
  add constraint user_view_state_view_kind_check
  check (view_kind in ('traceability', 'run_history', 'bugs', 'workbench'));

-- char_length counts code points, the same unit the application counts with
-- Array.from(name).length. btrim only strips ASCII spaces; the application
-- trims with String#trim before it writes.
alter table public.user_view_state
  drop constraint if exists user_view_state_name_check;
alter table public.user_view_state
  add constraint user_view_state_name_check
  check (
    char_length(name) between 1 and 80
    and name = btrim(name)
    and name !~ '[[:cntrl:]]'
  );

alter table public.user_view_state
  drop constraint if exists user_view_state_state_check;
alter table public.user_view_state
  add constraint user_view_state_state_check
  check (
    jsonb_typeof(state) = 'object'
    and state <> '{}'::jsonb
    and octet_length(state::text) <= 4096
  );

-- ---------------------------------------------------------------------------
-- 4. Triggers (both SECURITY INVOKER; they read user_view_state only, through
--    the caller's RLS, so they never count or compare a row the caller could
--    not see)
-- ---------------------------------------------------------------------------
create or replace function public.bunkai_user_view_state_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Serialize concurrent inserts for one (person, project, surface) so the
    -- count below cannot be raced past the cap.
    perform pg_advisory_xact_lock(
      hashtextextended(new.user_id::text || ':' || new.project_id::text || ':' || new.view_kind, 0)
    );
    if (
      select count(*)
      from public.user_view_state v
      where v.user_id = new.user_id
        and v.project_id = new.project_id
        and v.view_kind = new.view_kind
    ) >= 25 then
      raise exception 'saved_view_limit_reached' using errcode = '45100';
    end if;
    return new;
  end if;

  -- UPDATE: a view never moves between people, projects or surfaces.
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.project_id is distinct from old.project_id
     or new.view_kind is distinct from old.view_kind
     or new.created_at is distinct from old.created_at then
    raise exception 'saved_view_immutable_column' using errcode = '45101';
  end if;
  return new;
end;
$$;

drop trigger if exists user_view_state_guard on public.user_view_state;
create trigger user_view_state_guard
  before insert or update on public.user_view_state
  for each row execute function public.bunkai_user_view_state_guard();

drop trigger if exists user_view_state_set_updated_at on public.user_view_state;
create trigger user_view_state_set_updated_at
  before update on public.user_view_state
  for each row execute function public.bunkai_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Policies: owner-only AND current membership of the project's live
--    workspace. 0009's policies were ownership-only, so a member removed from
--    a project kept a readable, writable leftover row; the membership
--    predicate closes that for all four verbs. The row stays in the table
--    (reversible) but is invisible to everyone, the removed person included.
-- ---------------------------------------------------------------------------
drop policy if exists user_view_state_select_self on public.user_view_state;
create policy user_view_state_select_self
  on public.user_view_state
  for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = user_view_state.project_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists user_view_state_insert_self on public.user_view_state;
create policy user_view_state_insert_self
  on public.user_view_state
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = user_view_state.project_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists user_view_state_update_self on public.user_view_state;
create policy user_view_state_update_self
  on public.user_view_state
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = user_view_state.project_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = user_view_state.project_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists user_view_state_delete_self on public.user_view_state;
create policy user_view_state_delete_self
  on public.user_view_state
  for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = user_view_state.project_id
        and public.bunkai_is_workspace_member(p.workspace_id)
    )
  );
