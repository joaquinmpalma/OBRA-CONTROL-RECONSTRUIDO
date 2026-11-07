-- OBRA CONTROL v14: respaldo cloud por usuario autenticado.
-- Safe additive migration: does not alter existing construction/quality tables.
create table if not exists public.obra_control_v14_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (module in ('main','plans','gantt')),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, module)
);
alter table public.obra_control_v14_state enable row level security;
revoke all on public.obra_control_v14_state from anon, public;
grant select, insert, update, delete on public.obra_control_v14_state to authenticated;
drop policy if exists "v14_state_read_own" on public.obra_control_v14_state;
create policy "v14_state_read_own" on public.obra_control_v14_state
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "v14_state_insert_own" on public.obra_control_v14_state;
create policy "v14_state_insert_own" on public.obra_control_v14_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "v14_state_update_own" on public.obra_control_v14_state;
create policy "v14_state_update_own" on public.obra_control_v14_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "v14_state_delete_own" on public.obra_control_v14_state;
create policy "v14_state_delete_own" on public.obra_control_v14_state
  for delete to authenticated using ((select auth.uid()) = user_id);
