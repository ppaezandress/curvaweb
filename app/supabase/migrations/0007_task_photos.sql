-- Fotos relacionadas a tareas (avances, evidencia, referencias) — en cualquier
-- momento, compartidas con el equipo. Distinto del selfie local de celebración.

create table if not exists public.task_photos (
  id bigint generated always as identity primary key,
  task_id text not null,
  user_id uuid references public.profiles(id) on delete set null,
  url text not null,
  caption text,
  created_at timestamptz default now()
);
create index if not exists task_photos_task on public.task_photos(task_id, created_at desc);

alter table public.task_photos enable row level security;
drop policy if exists "task_photos_read" on public.task_photos;
create policy "task_photos_read" on public.task_photos for select to authenticated using (true);
drop policy if exists "task_photos_insert" on public.task_photos;
create policy "task_photos_insert" on public.task_photos for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "task_photos_delete" on public.task_photos;
create policy "task_photos_delete" on public.task_photos for delete to authenticated using (auth.uid() = user_id);

-- Bucket de almacenamiento (público para lectura)
insert into storage.buckets (id, name, public) values ('task-photos', 'task-photos', true)
on conflict (id) do nothing;

drop policy if exists "taskphotos_read" on storage.objects;
create policy "taskphotos_read" on storage.objects for select using (bucket_id = 'task-photos');
drop policy if exists "taskphotos_write_own" on storage.objects;
create policy "taskphotos_write_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "taskphotos_delete_own" on storage.objects;
create policy "taskphotos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'task-photos' and (storage.foldername(name))[1] = auth.uid()::text);

do $$ begin alter publication supabase_realtime add table public.task_photos; exception when others then null; end $$;
