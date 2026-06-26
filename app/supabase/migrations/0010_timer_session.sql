-- Reloj cross-device: UNA fila por usuario = su sesión manual ACTIVA (la que corre)
-- + sus tabs abiertos. Así el cronómetro lo "sigue" entre dispositivos vía Realtime.
-- Solo la sesión activa vive aquí; los registros terminados siguen yendo a Notion.

create table if not exists public.timer_sessions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  task_id text,
  started_at timestamptz,
  open_tasks text[] default '{}',
  updated_at timestamptz default now()
);

alter table public.timer_sessions enable row level security;
-- Dueño-solo: cada quien ve/edita únicamente su propia fila.
drop policy if exists "timer_sessions_rw" on public.timer_sessions;
create policy "timer_sessions_rw" on public.timer_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ begin alter publication supabase_realtime add table public.timer_sessions; exception when others then null; end $$;
