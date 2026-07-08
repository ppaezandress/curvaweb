-- Archivos importantes por canal (biblioteca del canal, tipo "Files" de Slack).
-- Sube archivos al bucket channel-files o guarda links externos. Cualquier miembro
-- agrega; borra quien lo subió o un admin.
create table if not exists public.channel_files (
  id bigint generated always as identity primary key,
  channel_id bigint not null references public.channels(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  name text not null,
  url text not null,
  kind text not null default 'file', -- file | link
  mime text,
  created_at timestamptz default now()
);
create index if not exists channel_files_channel on public.channel_files(channel_id, created_at desc);
alter table public.channel_files enable row level security;

drop policy if exists "cfiles_read" on public.channel_files;
create policy "cfiles_read" on public.channel_files for select using (true);
drop policy if exists "cfiles_insert" on public.channel_files;
create policy "cfiles_insert" on public.channel_files for insert to authenticated with check (added_by = auth.uid());
drop policy if exists "cfiles_delete" on public.channel_files;
create policy "cfiles_delete" on public.channel_files for delete to authenticated
  using (added_by = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

alter publication supabase_realtime add table public.channel_files;

-- Bucket de archivos de canal (lectura pública; escritura/borrado en carpeta propia <uid>/...).
insert into storage.buckets (id, name, public) values ('channel-files', 'channel-files', true)
  on conflict (id) do nothing;

drop policy if exists "cfiles_storage_read" on storage.objects;
create policy "cfiles_storage_read" on storage.objects for select using (bucket_id = 'channel-files');
drop policy if exists "cfiles_storage_write" on storage.objects;
create policy "cfiles_storage_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'channel-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "cfiles_storage_delete" on storage.objects;
create policy "cfiles_storage_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'channel-files' and (storage.foldername(name))[1] = auth.uid()::text);
