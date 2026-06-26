-- Roster COMPLETO de personas de la org (no solo las que tienen cuenta). Lo llena el sync
-- desde Notion (cada asignado de tareas), para que los avatares/asignados resuelvan en modo
-- Postgres aunque el compa todavía no haya entrado a la app.

create table if not exists public.org_people (
  org_id uuid not null references public.organizations(id) on delete cascade,
  notion_user_id text not null,
  name text not null default '',
  email text,
  synced_at timestamptz default now(),
  primary key (org_id, notion_user_id)
);

alter table public.org_people enable row level security;
drop policy if exists "org_people_read" on public.org_people;
create policy "org_people_read" on public.org_people for select to authenticated using (public.is_org_member(org_id));
-- (la escritura la hace el sync con service role; no necesita policy de insert para usuarios)
