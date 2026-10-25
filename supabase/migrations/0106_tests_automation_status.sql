-- ============================================================================
-- 0106_tests_automation_status
--
-- BK-218 — Team Chat rich links: a Test card shows its Automation Status, which
-- needs a persisted source (a latest-Run result is NOT an allowed substitute).
--
-- Decision (AI Tech Lead, BK-218 Jira comment): a plain additive column on
-- `tests` — NOT NULL, default 'manual-only', CHECK-constrained to the three
-- values the acceptance criteria name. Existing rows backfill to the default
-- (every Test today is executed by hand). No write path ships in this story:
-- the value is read-only for chat; whichever story later automates a Test owns
-- the update. Reads ride the existing `tests` SELECT policy (workspace member).
-- ============================================================================

alter table public.tests
  add column if not exists automation_status text not null default 'manual-only';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'tests_automation_status_check' and conrelid = 'public.tests'::regclass
  ) then
    alter table public.tests
      add constraint tests_automation_status_check
      check (automation_status in ('manual-only', 'candidate', 'automated'));
  end if;
end;
$$;
