-- Run in the "task" Supabase project (ggudrgzqleunhaiegyce).
-- Holds the MCP access token. RLS on, no policies -> only service_role (the edge function) can read it.
-- Replace :TOKEN with the real value (kept out of git; it lives only in this table).
create table if not exists public.mcp_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
comment on table public.mcp_config is 'Gershon MCP server (edge fn gershon-mcp): access token. RLS-locked; read only by service_role.';
alter table public.mcp_config enable row level security;
revoke all on public.mcp_config from anon, authenticated;
insert into public.mcp_config(key,value) values ('access_token', ':TOKEN')
on conflict (key) do update set value = excluded.value, updated_at = now();
