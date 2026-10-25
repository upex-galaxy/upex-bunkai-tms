-- BK-742 — keyset paging for the Test tag lookup (GET /api/v1/tests?tag=).
--
-- bunkai_filter_tests_by_tag (latest: 0089) returned EVERY matching Test in one
-- jsonb array. It now returns one bounded page, ordered by the total order
-- (created_at desc, id desc), and says plainly whether more remain:
--
--   { "items": [ {id,title,tags,step_count}, ... ],
--     "next_after": null | { "created_at": <timestamptz>, "id": <uuid> } }
--
-- `next_after` is the keyset position of the LAST returned row, present only
-- when at least one more matching Test exists (limit+1 probe). The route
-- encodes it into the opaque `next_cursor`. Out-of-range limits are refused by
-- the route (422); the RPC clamps to 1..50 only as defence for direct callers.
--
-- The 2-arg signature is dropped (not overloaded): PostgREST cannot resolve two
-- overloads that both accept the same named args. Workspace isolation, the
-- actor bind and the BK-991 deleted-workspace guard are carried over unchanged.
-- Additive/idempotent apart from the signature swap.

create index if not exists tests_created_at_id_idx
  on public.tests (created_at desc, id desc);

drop function if exists public.bunkai_filter_tests_by_tag(uuid, text);

create or replace function public.bunkai_filter_tests_by_tag(
  p_actor_user_id uuid,
  p_tag           text,
  p_limit         int         default 20,
  p_after_created timestamptz default null,
  p_after_id      uuid        default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tag    text;
  v_limit  int;
  v_rows   jsonb;
  v_count  int;
  v_last   jsonb;
begin
  -- 0. Actor bind (BK-635).
  if auth.uid() is not null and p_actor_user_id <> auth.uid() then
    raise exception 'actor mismatch' using errcode = '42501';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  v_tag := (public.bunkai_normalize_test_tags(array[coalesce(p_tag, '')]))[1];
  if v_tag is null then
    return jsonb_build_object('items', '[]'::jsonb, 'next_after', null);
  end if;

  -- Fetch limit+1 rows: the extra one only proves more remain.
  select coalesce(jsonb_agg(row_json order by created_at desc, id desc), '[]'::jsonb)
    into v_rows
  from (
    select
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'tags', coalesce(to_jsonb(t.tags), '[]'::jsonb),
        'step_count', (select count(*) from public.test_steps ts where ts.test_id = t.id)
      ) as row_json,
      t.created_at,
      t.id
    from public.tests t
    join public.workspaces w on w.id = t.workspace_id
    join public.workspace_members wm on wm.workspace_id = t.workspace_id
    where wm.user_id = p_actor_user_id
      and wm.status = 'active'
      -- BK-991: a soft-deleted workspace is out of reach (ADR-0015).
      and w.deleted_at is null
      and t.tags @> array[v_tag]
      and (
        p_after_created is null
        or p_after_id is null
        or (t.created_at, t.id) < (p_after_created, p_after_id)
      )
    order by t.created_at desc, t.id desc
    limit v_limit + 1
  ) ranked;

  v_count := jsonb_array_length(v_rows);
  if v_count <= v_limit then
    return jsonb_build_object('items', v_rows, 'next_after', null);
  end if;

  -- Position of the last row actually returned; it needs created_at, so
  -- re-read it from the table by id (row_json does not carry it).
  select jsonb_build_object('created_at', t.created_at, 'id', t.id)
    into v_last
  from public.tests t
  where t.id = ((v_rows -> (v_limit - 1)) ->> 'id')::uuid;

  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
                from jsonb_array_elements(v_rows) with ordinality as e(value, ord)
               where e.ord <= v_limit),
    'next_after', v_last
  );
end;
$$;

revoke execute on function public.bunkai_filter_tests_by_tag(uuid, text, int, timestamptz, uuid) from public, anon, authenticated;
grant  execute on function public.bunkai_filter_tests_by_tag(uuid, text, int, timestamptz, uuid) to service_role;
