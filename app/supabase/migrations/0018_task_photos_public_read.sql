-- Las fotos del equipo son una capa social y las imágenes ya son públicas (bucket
-- task-photos con lectura pública). El feed en /momentos NO se veía para quien entró
-- por "acceso rápido" (sin sesión Supabase Auth), porque la policy de lectura era
-- `to authenticated`. Lo abrimos a todos para que el feed se vea siempre.
drop policy if exists "task_photos_read" on public.task_photos;
create policy "task_photos_read" on public.task_photos for select using (true);
