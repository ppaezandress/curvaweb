-- Sprint 2 (ADITIVO, sin downtime): esquema multi-tenant donde Postgres es el sistema
-- de registro de eventos/tiempos. Convive con lo actual; Notion sigue siendo primario
-- detrás de un flag hasta validar. NADA se borra ni se reemplaza aquí.

-- ── Organizaciones y membresía ──
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notion_workspace_id text,
  plan text default 'pilot',
  created_at timestamptz default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notion_user_id text,
  role text not null default 'member', -- owner | admin | member
  created_at timestamptz default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user on public.org_members(user_id);

-- Helper SECURITY DEFINER: ¿el usuario actual pertenece a esta org? (evita recursión en RLS)
create or replace function public.is_org_member(o uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.org_members m where m.org_id = o and m.user_id = auth.uid());
$$;

-- ── Espejo de metadata (sync desde Notion) ──
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  notion_page_id text unique,
  name text not null default '',
  synced_at timestamptz default now()
);
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  notion_page_id text unique,
  name text not null default '',
  client_id uuid references public.clients(id) on delete set null,
  synced_at timestamptz default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  notion_page_id text unique,                 -- null = tarea nativa de CURVA
  name text not null default '',
  status text, type text, weight text, priority text,
  responsable_id text, auxiliar_ids text[] default '{}',
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  due_date date, internal boolean default false, baseline_seconds int default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(), synced_at timestamptz default now()
);
create index if not exists tasks_org on public.tasks(org_id);

-- ── El sistema de registro ──
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null, ended_at timestamptz not null,
  minutes int not null, inactive_minutes int default 0,
  mode text default 'manual',     -- manual | ai | passive
  source text default 'timer',    -- timer | gcal | git | notion_status | tauri | hooks
  confirmed boolean default false,
  created_at timestamptz default now()
);
create index if not exists time_entries_user on public.time_entries(user_id, started_at desc);
create index if not exists time_entries_org on public.time_entries(org_id, started_at desc);

create table if not exists public.sync_state (
  org_id uuid not null references public.organizations(id) on delete cascade,
  resource text not null,         -- tasks | clients | projects
  last_cursor text, last_synced_at timestamptz, status text,
  primary key (org_id, resource)
);

-- ── RLS: todo scoped a la org del usuario ──
do $$ declare t text;
begin
  foreach t in array array['organizations','org_members','clients','projects','tasks','time_entries','sync_state']
  loop execute format('alter table public.%I enable row level security;', t); end loop;
end $$;

drop policy if exists "org_read" on public.organizations;
create policy "org_read" on public.organizations for select to authenticated using (public.is_org_member(id));

drop policy if exists "org_members_read" on public.org_members;
create policy "org_members_read" on public.org_members for select to authenticated using (public.is_org_member(org_id));

-- clients/projects/tasks/sync_state: lectura/escritura para miembros de la org.
do $$ declare t text;
begin
  foreach t in array array['clients','projects','tasks','sync_state']
  loop
    execute format('drop policy if exists "%s_rw" on public.%I;', t, t);
    execute format('create policy "%s_rw" on public.%I for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));', t, t);
  end loop;
end $$;

-- time_entries: el CRUDO es dueño-solo (la base del muro anti-vigilancia). Los agregados
-- de equipo saldrán de vistas/RPC con cohorte mínima (Sprint 5), no de lectura directa.
drop policy if exists "time_entries_own" on public.time_entries;
create policy "time_entries_own" on public.time_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_org_member(org_id));
