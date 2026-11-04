-- Run in the "radar" Supabase project (pkzeeqehwmtnqxdpdesl).
-- Two read-only, token-gated functions the MCP calls with Radar's PUBLIC key.
-- Without the right token they raise 'unauthorized', so the public key alone reveals nothing.
-- Replace :TOKEN with the same value as in the task project.
create table if not exists public.mcp_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.mcp_config enable row level security;
revoke all on public.mcp_config from anon, authenticated;
insert into public.mcp_config(key,value) values ('access_token', ':TOKEN')
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.mcp_check_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or not exists (select 1 from mcp_config where key = 'access_token' and value = p_token) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
end $$;
revoke all on function public.mcp_check_token(text) from public, anon, authenticated;

create or replace function public.mcp_radar_summary(p_token text, p_days int default 7)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  d int := greatest(1, least(coalesce(p_days, 7), 365));
  since timestamptz := now() - make_interval(days => d);
begin
  perform mcp_check_token(p_token);
  return jsonb_build_object(
    'window_days', d,
    'since', since,
    'owners', coalesce((select jsonb_agg(o) from (
      select jsonb_build_object(
        'owner', u.owner_key, 'name', u.display_name, 'status', u.status, 'last_login_at', u.last_login_at,
        'prospects_total', (select count(*) from targets t where t.owner_key = u.owner_key),
        'prospects_collected_in_window', (select count(*) from targets t where t.owner_key = u.owner_key and t.collected_date >= since),
        'pushed_to_botdog_in_window', (select count(*) from targets t where t.owner_key = u.owner_key and t.botdog_pushed >= since),
        'salesnav_listed_in_window', (select count(*) from targets t where t.owner_key = u.owner_key and t.salesnav_listed_at >= since),
        'grades_in_window', (select coalesce(jsonb_object_agg(coalesce(g, 'ungraded'), n), '{}'::jsonb)
                             from (select t.grade g, count(*) n from targets t
                                   where t.owner_key = u.owner_key and t.collected_date >= since group by t.grade) x),
        'sources', (select count(*) from sources s where s.owner_key = u.owner_key),
        'last_activity_at', (select max(a.at) from activity_log a where a.owner_key = u.owner_key)
      ) o
      from (select distinct on (owner_key) * from users order by owner_key, created_at) u
      union all
      select jsonb_build_object('owner', t.owner_key, 'note', 'has prospects but no Radar user row',
        'prospects_total', count(*),
        'prospects_collected_in_window', count(*) filter (where t.collected_date >= since))
      from targets t where not exists (select 1 from users u where u.owner_key = t.owner_key)
      group by t.owner_key
    ) q), '[]'::jsonb),
    'totals', jsonb_build_object(
      'prospects_total', (select count(*) from targets),
      'prospects_collected_in_window', (select count(*) from targets where collected_date >= since),
      'pushed_to_botdog_in_window', (select count(*) from targets where botdog_pushed >= since))
  );
end $$;

create or replace function public.mcp_radar_prospects(
  p_token text, p_owner text default null, p_grade text default null, p_days int default 30,
  p_min_score int default null, p_search text default null, p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
  perform mcp_check_token(p_token);
  return coalesce((select jsonb_agg(r) from (
    select t.first_name, t.last_name, t.title, t.company, t.linkedin_url, t.owner_key as owner,
           t.grade, t.score, t.score_reason, t.country, t.city, t.language, t.connection,
           t.collected_date, t.botdog_pushed, t.salesnav_listed_at, t.radar_person as found_via
    from targets t
    where (p_owner is null or t.owner_key ilike '%' || p_owner || '%')
      and (p_grade is null or t.grade = p_grade)
      and (p_days is null or t.collected_date >= now() - make_interval(days => greatest(1, least(p_days, 3650))))
      and (p_min_score is null or t.score >= p_min_score)
      and (p_search is null or (coalesce(t.first_name,'') || ' ' || coalesce(t.last_name,'') || ' ' ||
           coalesce(t.title,'') || ' ' || coalesce(t.company,'')) ilike '%' || p_search || '%')
    order by t.collected_date desc nulls last
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) r), '[]'::jsonb);
end $$;

revoke all on function public.mcp_radar_summary(text, int) from public;
revoke all on function public.mcp_radar_prospects(text, text, text, int, int, text, int) from public;
grant execute on function public.mcp_radar_summary(text, int) to anon, authenticated;
grant execute on function public.mcp_radar_prospects(text, text, text, int, int, text, int) to anon, authenticated;
