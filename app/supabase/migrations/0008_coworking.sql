-- Co-working en vivo: detectar y registrar cuando DOS personas trabajan la MISMA
-- tarea al mismo tiempo. El "total de sesión compartida" vive aquí (en Supabase);
-- NO se suma a las horas de la tarea en Notion (cada cronómetro ya registra lo suyo).

-- Necesitamos el ID de la tarea activa (no solo el nombre) para detectar coincidencias.
alter table public.presence add column if not exists current_task_id text;

create table if not exists public.coworking_sessions (
  id bigint generated always as identity primary key,
  task_id text not null,
  task_name text,
  user_a uuid not null references public.profiles(id) on delete cascade, -- SIEMPRE el uuid menor (dedup)
  user_b uuid not null references public.profiles(id) on delete cascade, -- SIEMPRE el uuid mayor
  started_at timestamptz not null,
  ended_at timestamptz not null,
  minutes int not null,
  created_at timestamptz default now()
);
create index if not exists coworking_pair on public.coworking_sessions(user_a, user_b, created_at desc);

alter table public.coworking_sessions enable row level security;
-- Cada quien ve solo las sesiones en las que participó.
drop policy if exists "coworking_read" on public.coworking_sessions;
create policy "coworking_read" on public.coworking_sessions for select to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);
drop policy if exists "coworking_insert" on public.coworking_sessions;
create policy "coworking_insert" on public.coworking_sessions for insert to authenticated
  with check (auth.uid() = user_a or auth.uid() = user_b);

do $$ begin alter publication supabase_realtime add table public.coworking_sessions; exception when others then null; end $$;
