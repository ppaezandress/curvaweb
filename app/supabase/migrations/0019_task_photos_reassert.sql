-- Re-asegura que las FOTOS DEL EQUIPO se vean para TODOS en /momentos.
-- Síntoma: no aparecen las fotos que suben otras personas del equipo.
-- Causa probable: en prod quedó algún pedazo sin aplicar (bucket no público,
-- política de lectura de Storage faltante, o lectura de tabla restringida).
-- Esta migración es IDEMPOTENTE: segura de correr varias veces.

-- 1) El bucket de imágenes debe ser PÚBLICO (las URLs son getPublicUrl).
insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', true)
on conflict (id) do update set public = true;

-- 2) Cualquiera puede LEER los archivos del bucket (las imágenes cargan para todos).
drop policy if exists "taskphotos_read" on storage.objects;
create policy "taskphotos_read" on storage.objects
  for select using (bucket_id = 'task-photos');

-- 3) La TABLA se lee para todos (feed social visible siempre, incluso acceso rápido).
alter table public.task_photos enable row level security;
drop policy if exists "task_photos_read" on public.task_photos;
create policy "task_photos_read" on public.task_photos
  for select using (true);

-- 4) Realtime del feed (para que las fotos nuevas aparezcan en vivo).
do $$ begin
  alter publication supabase_realtime add table public.task_photos;
exception when others then null; end $$;
