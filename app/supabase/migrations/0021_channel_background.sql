-- Fondo personalizable por canal (identidad del espacio, compartida por el equipo).
-- Guarda un objeto flexible: {kind:'none'|'color'|'gradient'|'pattern'|'image', ...}.
-- El UPDATE ya está restringido a creador/admin por la policy "channels_update" (0020).
alter table public.channels add column if not exists background jsonb;

-- Bucket para imágenes de fondo de canal (lectura pública; cada quien sube/borra
-- en su carpeta <uid>/..., mismo patrón que 'chat-media' en 0019).
insert into storage.buckets (id, name, public) values ('channel-backgrounds', 'channel-backgrounds', true)
  on conflict (id) do nothing;

drop policy if exists "channelbg_read" on storage.objects;
create policy "channelbg_read" on storage.objects for select using (bucket_id = 'channel-backgrounds');

drop policy if exists "channelbg_write_own" on storage.objects;
create policy "channelbg_write_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'channel-backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "channelbg_delete_own" on storage.objects;
create policy "channelbg_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'channel-backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);
