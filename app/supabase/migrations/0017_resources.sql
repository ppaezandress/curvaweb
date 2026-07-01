-- Espacio de recursos/documentos del equipo (brand book, plantillas, links útiles).
-- Curados por el equipo: todos los ven; cada quien agrega y borra lo suyo; los admins
-- pueden borrar cualquiera (limpieza).
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  kind text not null default 'link',
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.resources enable row level security;

-- Lectura: cualquier usuario autenticado del equipo.
drop policy if exists "resources_read" on public.resources;
create policy "resources_read" on public.resources
  for select to authenticated using (true);

-- Alta: cualquiera, pero solo a su propio nombre (added_by = uid).
drop policy if exists "resources_insert_own" on public.resources;
create policy "resources_insert_own" on public.resources
  for insert to authenticated with check (added_by = auth.uid());

-- Baja: el dueño, o un admin (para curar/limpiar).
drop policy if exists "resources_delete_own_or_admin" on public.resources;
create policy "resources_delete_own_or_admin" on public.resources
  for delete to authenticated using (
    added_by = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
