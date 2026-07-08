-- Fase 2 Slack: descripción (topic) del canal + estado de "no leídos" por usuario.

-- Topic / descripción del canal (lo edita creador/admin; ya cubierto por channels_update).
alter table public.channels add column if not exists topic text;

-- Última lectura por usuario y canal → para badges de no leídos y separador "nuevos".
create table if not exists public.channel_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_id bigint not null references public.channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
alter table public.channel_reads enable row level security;

drop policy if exists "reads_own_select" on public.channel_reads;
create policy "reads_own_select" on public.channel_reads for select to authenticated using (user_id = auth.uid());
drop policy if exists "reads_own_upsert" on public.channel_reads;
create policy "reads_own_upsert" on public.channel_reads for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "reads_own_update" on public.channel_reads;
create policy "reads_own_update" on public.channel_reads for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
