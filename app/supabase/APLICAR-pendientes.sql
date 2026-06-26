-- ════════════════════════════════════════════════════════════════════════════
-- CURVA — Aplicar TODO lo pendiente de una vez (Supabase → SQL Editor → Run).
-- Es ADITIVO e IDEMPOTENTE: no borra nada y se puede correr más de una vez sin daño.
-- Contiene: migraciones 0008–0011 + el seed de la org del piloto.
-- (Los archivos numerados en supabase/migrations/ son la fuente; esto es la copia
--  conveniente para pegar de un jalón.)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0008 · co-working ──────────────────────────────────────────────────────
alter table public.presence add column if not exists current_task_id text;
create table if not exists public.coworking_sessions (
  id bigint generated always as identity primary key, task_id text not null, task_name text,
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null, ended_at timestamptz not null, minutes int not null, created_at timestamptz default now());
alter table public.coworking_sessions enable row level security;
drop policy if exists "coworking_read" on public.coworking_sessions;
create policy "coworking_read" on public.coworking_sessions for select to authenticated using (auth.uid()=user_a or auth.uid()=user_b);
drop policy if exists "coworking_insert" on public.coworking_sessions;
create policy "coworking_insert" on public.coworking_sessions for insert to authenticated with check (auth.uid()=user_a or auth.uid()=user_b);
do $$ begin alter publication supabase_realtime add table public.coworking_sessions; exception when others then null; end $$;

-- ── 0009 · kudos ───────────────────────────────────────────────────────────
create table if not exists public.peer_feedback (
  id bigint generated always as identity primary key,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  session_id bigint references public.coworking_sessions(id) on delete set null,
  rating int not null default 1, note text, created_at timestamptz default now());
alter table public.peer_feedback enable row level security;
drop policy if exists "peer_feedback_read" on public.peer_feedback;
create policy "peer_feedback_read" on public.peer_feedback for select to authenticated using (auth.uid()=to_user or auth.uid()=from_user);
drop policy if exists "peer_feedback_insert" on public.peer_feedback;
create policy "peer_feedback_insert" on public.peer_feedback for insert to authenticated with check (auth.uid()=from_user and from_user<>to_user);
do $$ begin alter publication supabase_realtime add table public.peer_feedback; exception when others then null; end $$;

-- ── 0010 · reloj cross-device ──────────────────────────────────────────────
create table if not exists public.timer_sessions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  task_id text, started_at timestamptz, open_tasks text[] default '{}', updated_at timestamptz default now());
alter table public.timer_sessions enable row level security;
drop policy if exists "timer_sessions_rw" on public.timer_sessions;
create policy "timer_sessions_rw" on public.timer_sessions for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
do $$ begin alter publication supabase_realtime add table public.timer_sessions; exception when others then null; end $$;

-- ── 0011 · esquema multi-tenant (el flip) ──────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null, notion_workspace_id text, plan text default 'pilot', created_at timestamptz default now());
create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notion_user_id text, role text not null default 'member', created_at timestamptz default now(),
  primary key (org_id, user_id));
create index if not exists org_members_user on public.org_members(user_id);
create or replace function public.is_org_member(o uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.org_members m where m.org_id = o and m.user_id = auth.uid()); $$;
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  notion_page_id text unique, name text not null default '', synced_at timestamptz default now());
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  notion_page_id text unique, name text not null default '', client_id uuid references public.clients(id) on delete set null, synced_at timestamptz default now());
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  notion_page_id text unique, name text not null default '', status text, type text, weight text, priority text,
  responsable_id text, auxiliar_ids text[] default '{}',
  client_id uuid references public.clients(id) on delete set null, project_id uuid references public.projects(id) on delete set null,
  due_date date, internal boolean default false, baseline_seconds int default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(), synced_at timestamptz default now());
create index if not exists tasks_org on public.tasks(org_id);
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null, user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null, ended_at timestamptz not null, minutes int not null, inactive_minutes int default 0,
  mode text default 'manual', source text default 'timer', confirmed boolean default false, created_at timestamptz default now());
create index if not exists time_entries_user on public.time_entries(user_id, started_at desc);
create index if not exists time_entries_org on public.time_entries(org_id, started_at desc);
create table if not exists public.sync_state (
  org_id uuid not null references public.organizations(id) on delete cascade,
  resource text not null, last_cursor text, last_synced_at timestamptz, status text, primary key (org_id, resource));
do $$ declare t text; begin
  foreach t in array array['organizations','org_members','clients','projects','tasks','time_entries','sync_state']
  loop execute format('alter table public.%I enable row level security;', t); end loop; end $$;
drop policy if exists "org_read" on public.organizations;
create policy "org_read" on public.organizations for select to authenticated using (public.is_org_member(id));
drop policy if exists "org_members_read" on public.org_members;
create policy "org_members_read" on public.org_members for select to authenticated using (public.is_org_member(org_id));
do $$ declare t text; begin
  foreach t in array array['clients','projects','tasks','sync_state'] loop
    execute format('drop policy if exists "%s_rw" on public.%I;', t, t);
    execute format('create policy "%s_rw" on public.%I for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));', t, t);
  end loop; end $$;
drop policy if exists "time_entries_own" on public.time_entries;
create policy "time_entries_own" on public.time_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_org_member(org_id));

-- ── SEED · org del piloto + todos los perfiles como miembros ───────────────
insert into public.organizations (name, plan)
select 'CURVA', 'pilot' where not exists (select 1 from public.organizations);
insert into public.org_members (org_id, user_id, notion_user_id, role)
select o.id, p.id, p.notion_user_id, 'member'
from public.organizations o, public.profiles p
where o.name = 'CURVA'
on conflict (org_id, user_id) do nothing;
