-- Adjuntos en mensajes de chat: imagen / video / audio.
alter table public.messages add column if not exists attachment_url text;
alter table public.messages add column if not exists attachment_type text; -- image | video | audio

-- Bucket para media del chat (lectura pública; cada quien sube/borra en su carpeta <uid>/...).
insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', true)
  on conflict (id) do nothing;

drop policy if exists "chatmedia_read" on storage.objects;
create policy "chatmedia_read" on storage.objects for select using (bucket_id = 'chat-media');

drop policy if exists "chatmedia_write_own" on storage.objects;
create policy "chatmedia_write_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chatmedia_delete_own" on storage.objects;
create policy "chatmedia_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);
