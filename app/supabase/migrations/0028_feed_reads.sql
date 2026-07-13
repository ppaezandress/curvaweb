-- Bolita de "nueva foto del equipo": marca por usuario de la última vez que vio el
-- muro de fotos (Momentos). Mismo patrón que channel_reads (0023).
create table if not exists public.feed_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  feed text not null default 'photos',
  last_seen_at timestamptz not null default now(),
  primary key (user_id, feed)
);

alter table public.feed_reads enable row level security;

-- Cada quien solo ve y escribe su propia marca.
drop policy if exists feed_reads_select on public.feed_reads;
create policy feed_reads_select on public.feed_reads
  for select using (auth.uid() = user_id);

drop policy if exists feed_reads_upsert on public.feed_reads;
create policy feed_reads_upsert on public.feed_reads
  for insert with check (auth.uid() = user_id);

drop policy if exists feed_reads_update on public.feed_reads;
create policy feed_reads_update on public.feed_reads
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
