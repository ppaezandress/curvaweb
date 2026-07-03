-- Administración de canales: renombrar y ocultar/archivar.
-- Puede hacerlo el CREADOR del canal o un admin de la app (profiles.is_admin).
alter table public.channels add column if not exists is_hidden boolean default false;

drop policy if exists "channels_update" on public.channels;
create policy "channels_update" on public.channels for update to authenticated
  using (created_by = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (created_by = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "channels_delete" on public.channels;
create policy "channels_delete" on public.channels for delete to authenticated
  using (created_by = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
