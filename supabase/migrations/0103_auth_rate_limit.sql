-- ============================================================================
-- 0103_auth_rate_limit
--
-- BK-743 — app-level rate limiter for the pre-authenticated email-existence
-- check (POST /api/v1/auth/check-email), the mitigation ADR-0007 point 5 filed
-- as a follow-up. Store decision (AI Tech Lead, BK-743 comments): Postgres
-- behind a narrow seam, so the count is shared by every serverless instance.
--
-- SHAPE
--   * public.rate_limit_hits — one row per ALLOWED hit (sliding log, so the
--     windows are genuinely rolling, not fixed calendar buckets).
--   * key is opaque text shaped `scope:identifier:step`. The identifier the
--     caller supplies is already a salted digest (BR-11); this migration never
--     sees a raw address.
--   * public.bunkai_rate_limit_consume(key, windows) checks every window and,
--     only when all have budget, records the hit. The whole check+insert runs
--     under a per-key transaction advisory lock, so concurrent requests for
--     one key serialise: at most `max` successes per window (no read-then-write
--     race).
--   * Expired rows are swept by pg_cron (pattern of 0075).
--
-- Access: service_role only. RLS is on with no policies; anon/authenticated
-- get nothing.
-- ============================================================================

create table if not exists public.rate_limit_hits (
  id      bigint generated always as identity primary key,
  key     text not null,
  hit_at  timestamptz not null default clock_timestamp()
);

create index if not exists rate_limit_hits_key_hit_at_idx
  on public.rate_limit_hits (key, hit_at desc);

create index if not exists rate_limit_hits_hit_at_idx
  on public.rate_limit_hits (hit_at);

alter table public.rate_limit_hits enable row level security;

revoke all on table public.rate_limit_hits from public;
revoke all on table public.rate_limit_hits from anon;
revoke all on table public.rate_limit_hits from authenticated;
grant select, insert, delete on table public.rate_limit_hits to service_role;


-- p_windows: jsonb array of {"window_seconds": int, "max": int}.
-- Returns {"allowed": true} or {"allowed": false, "retry_after_seconds": int}.
-- SQLSTATE 45230 rate_limit_windows_invalid on a malformed window list.
create or replace function public.bunkai_rate_limit_consume(
  p_key     text,
  p_windows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now    timestamptz := clock_timestamp();
  v_w      jsonb;
  v_secs   int;
  v_max    int;
  v_count  int;
  v_oldest timestamptz;
  v_retry  int := 0;
begin
  if p_key is null or length(p_key) = 0
     or p_windows is null or jsonb_typeof(p_windows) <> 'array'
     or jsonb_array_length(p_windows) = 0 then
    raise exception 'rate_limit_windows_invalid' using errcode = '45230';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));

  for v_w in select * from jsonb_array_elements(p_windows) loop
    v_secs := (v_w ->> 'window_seconds')::int;
    v_max  := (v_w ->> 'max')::int;
    if v_secs is null or v_secs < 1 or v_max is null or v_max < 1 then
      raise exception 'rate_limit_windows_invalid' using errcode = '45230';
    end if;

    select count(*), min(hit_at)
      into v_count, v_oldest
      from public.rate_limit_hits
      where key = p_key
        and hit_at > v_now - make_interval(secs => v_secs);

    if v_count >= v_max then
      v_retry := greatest(
        v_retry,
        greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => v_secs) - v_now)))::int)
      );
    end if;
  end loop;

  if v_retry > 0 then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry);
  end if;

  insert into public.rate_limit_hits (key, hit_at) values (p_key, v_now);
  return jsonb_build_object('allowed', true);
end;
$$;

revoke execute on function public.bunkai_rate_limit_consume(text, jsonb) from public;
revoke execute on function public.bunkai_rate_limit_consume(text, jsonb) from anon;
revoke execute on function public.bunkai_rate_limit_consume(text, jsonb) from authenticated;
grant  execute on function public.bunkai_rate_limit_consume(text, jsonb) to service_role;


-- Sweep: no window is longer than 24h, so anything older is dead weight.
create or replace function public.bunkai_sweep_rate_limit_hits()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from public.rate_limit_hits where hit_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.bunkai_sweep_rate_limit_hits() from public;
revoke execute on function public.bunkai_sweep_rate_limit_hits() from anon;
revoke execute on function public.bunkai_sweep_rate_limit_hits() from authenticated;
grant  execute on function public.bunkai_sweep_rate_limit_hits() to service_role;

create extension if not exists pg_cron;

select cron.schedule(
  'bunkai-sweep-rate-limit-hits',
  '17 * * * *',
  $$select public.bunkai_sweep_rate_limit_hits()$$
);
