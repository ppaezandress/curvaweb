-- Kudos entre compañeros (evaluaciones cruzadas, versión "buena onda"): tras trabajar
-- juntos (coworking_sessions), puedes mandarle reconocimiento POSITIVO a alguien. Cada
-- quien ve solo los kudos que recibió (privado, nunca matriz para fundadores). El campo
-- rating queda para flexibilidad futura; la UI solo manda señal positiva.

create table if not exists public.peer_feedback (
  id bigint generated always as identity primary key,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  session_id bigint references public.coworking_sessions(id) on delete set null,
  rating int not null default 1,
  note text,
  created_at timestamptz default now()
);
create index if not exists peer_feedback_to on public.peer_feedback(to_user, created_at desc);

alter table public.peer_feedback enable row level security;
-- Lectura: lo que RECIBISTE (kudos a la persona) + lo que TÚ enviaste (para no repetir).
-- Nunca ves kudos entre terceros.
drop policy if exists "peer_feedback_read" on public.peer_feedback;
create policy "peer_feedback_read" on public.peer_feedback for select to authenticated
  using (auth.uid() = to_user or auth.uid() = from_user);
-- Solo puedes mandar kudos en tu propio nombre.
drop policy if exists "peer_feedback_insert" on public.peer_feedback;
create policy "peer_feedback_insert" on public.peer_feedback for insert to authenticated
  with check (auth.uid() = from_user and from_user <> to_user);

do $$ begin alter publication supabase_realtime add table public.peer_feedback; exception when others then null; end $$;
