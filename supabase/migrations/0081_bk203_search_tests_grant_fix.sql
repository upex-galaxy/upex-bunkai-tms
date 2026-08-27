-- 0081_bk203_search_tests_grant_fix.sql — BK-203 Conductor review round 1,
-- item 1 (MAJOR): bunkai_search_tests (0076) was granted to `authenticated`
-- with a caller-supplied `p_actor_user_id` never checked against auth.uid().
-- Any signed-in user could pass someone else's uuid + a foreign project_id
-- and read Test titles/tags out of a workspace they are not a member of.
--
-- 0076 was already applied to the remote (ledger version 20260827065549)
-- before this fix was written, so the fix cannot land as an amend to 0076 —
-- amend-in-place (README.md §2) is only for migrations still in flight,
-- never applied. This is a fresh, additive ledger row instead; 0076 in the
-- repo is reverted back to its as-applied text so the file matches the row.
--
-- Two-part fix, unchanged from the review's prescribed shape:
--   1. An auth.uid() guard inside the function body — defense in depth for
--      any future caller that reaches this RPC with a user JWT instead of
--      the admin client. `auth.uid() is not null` preserves the PAT path (a
--      PAT caller carries no auth.uid()); auth.uid() is schema-qualified so
--      search_path = '' is not a problem.
--   2. Revoke `authenticated`, leave only `service_role` — the only caller
--      is app/api/v1/tests/search/route.ts, which goes through
--      createAdminClient(), never the browser client.
--
-- bunkai_search_atcs (0027) and bunkai_filter_tests_by_tag (0030) carry the
-- identical live posture and are NOT touched here — that is BK-635.

create or replace function public.bunkai_search_tests(
  p_actor_user_id uuid,
  p_query         text,
  p_project_id    uuid,
  p_limit         int default 20
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_query  text;
  v_limit  int;
  v_result jsonb;
begin
  if auth.uid() is not null and p_actor_user_id <> auth.uid() then
    raise exception 'actor mismatch' using errcode = '42501';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_query := btrim(coalesce(p_query, ''));
  if v_query = '' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'tags', coalesce(to_jsonb(t.tags), '[]'::jsonb)
      ) as row_json,
      t.created_at
    from public.tests t
    join public.workspace_members wm on wm.workspace_id = t.workspace_id
    where wm.user_id = p_actor_user_id
      and wm.status = 'active'
      -- Same ALL-match posture as bunkai_add_tests_to_plan: a Test whose
      -- chain spans two projects is not a member of either search result set
      -- — searching in Project A must not surface a Test that
      -- bunkai_add_tests_to_plan would then reject with 45604.
      and exists (
        select 1 from public.test_steps ts
        where ts.test_id = t.id
      )
      and not exists (
        select 1
        from public.test_steps ts
        join public.atcs a on a.id = ts.atc_id
        where ts.test_id = t.id
          and a.project_id <> p_project_id
      )
      and (
        t.title ilike '%' || v_query || '%'
        or exists (select 1 from unnest(t.tags) as tag where tag ilike '%' || v_query || '%')
      )
    order by t.created_at desc
    limit v_limit
  ) matched;

  return v_result;
end;
$$;

-- service_role only: the route calls this through createAdminClient() (never
-- the browser client), and p_actor_user_id is caller-supplied — granting to
-- authenticated would let any signed-in user pass someone else's uuid and a
-- foreign project_id to read Tests out of a workspace they are not a member
-- of. The auth.uid() guard above is defense in depth if this is ever called
-- with a user JWT.
revoke execute on function public.bunkai_search_tests(uuid, text, uuid, int) from public, anon, authenticated;
grant  execute on function public.bunkai_search_tests(uuid, text, uuid, int) to service_role;
