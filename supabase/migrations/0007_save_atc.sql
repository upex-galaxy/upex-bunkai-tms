-- Migration: 0007 — atomic ATC save RPC
-- Authored: 2026-05-20
--
-- Replaces the per-table "delete-then-insert" dance a Server Action would
-- otherwise have to run as four separate PostgREST round trips. Wrapping the
-- operation in a SECURITY INVOKER plpgsql function gives us:
--   * A single transaction — partial writes roll back cleanly.
--   * RLS evaluated as the caller, so existing `atcs.UPDATE`,
--     `atc_steps.{DELETE,INSERT}`, `atc_assertions.{DELETE,INSERT}`,
--     `atc_acceptance_criteria.{DELETE,INSERT}` policies still gate access.
--   * One round trip → simpler error handling at the Server Action layer.
--
-- The function takes the new ATC header fields, the full ordered list of
-- steps and assertions (as JSON arrays), and the full set of AC ids to bind.
-- It deletes the existing child rows for that ATC and re-inserts them. We
-- intentionally do not diff/preserve ids on children — they are owned by the
-- ATC and the editor treats them as a single editable block.

create or replace function public.bunkai_save_atc(
  p_atc_id uuid,
  p_title text,
  p_layer text,
  p_tags text[],
  p_user_story_id uuid,
  p_steps jsonb,
  p_assertions jsonb,
  p_ac_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_step jsonb;
  v_assertion jsonb;
  v_position int;
  v_ac_id uuid;
begin
  -- Header. Bumping version on every save gives the editor an optimistic-lock
  -- handle for Phase E (if-match) without changing the schema.
  update public.atcs
  set title = p_title,
      layer = p_layer,
      tags = p_tags,
      user_story_id = p_user_story_id,
      version = version + 1,
      updated_at = now()
  where id = p_atc_id;

  if not found then
    raise exception 'atc_not_found' using errcode = '22023';
  end if;

  -- Children: full replace. Order in JSON arrays drives `position`.
  delete from public.atc_steps where atc_id = p_atc_id;
  v_position := 0;
  for v_step in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    insert into public.atc_steps (atc_id, position, content, input_data, expected)
    values (
      p_atc_id,
      v_position,
      coalesce(v_step ->> 'content', ''),
      nullif(v_step ->> 'input_data', ''),
      nullif(v_step ->> 'expected', '')
    );
    v_position := v_position + 1;
  end loop;

  delete from public.atc_assertions where atc_id = p_atc_id;
  v_position := 0;
  for v_assertion in select * from jsonb_array_elements(coalesce(p_assertions, '[]'::jsonb))
  loop
    insert into public.atc_assertions (atc_id, position, content)
    values (
      p_atc_id,
      v_position,
      coalesce(v_assertion ->> 'content', '')
    );
    v_position := v_position + 1;
  end loop;

  delete from public.atc_acceptance_criteria where atc_id = p_atc_id;
  if p_ac_ids is not null then
    foreach v_ac_id in array p_ac_ids loop
      insert into public.atc_acceptance_criteria (atc_id, acceptance_criterion_id)
      values (p_atc_id, v_ac_id);
    end loop;
  end if;
end;
$$;

revoke execute on function public.bunkai_save_atc(uuid, text, text, text[], uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.bunkai_save_atc(uuid, text, text, text[], uuid, jsonb, jsonb, uuid[]) to authenticated;
