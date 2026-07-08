-- Mensajes guardados (marcadores personales), estilo Slack "Guardados".
create table if not exists public.message_saved (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id bigint not null references public.messages(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, message_id)
);
alter table public.message_saved enable row level security;

drop policy if exists "saved_own_select" on public.message_saved;
create policy "saved_own_select" on public.message_saved for select to authenticated using (user_id = auth.uid());
drop policy if exists "saved_own_insert" on public.message_saved;
create policy "saved_own_insert" on public.message_saved for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "saved_own_delete" on public.message_saved;
create policy "saved_own_delete" on public.message_saved for delete to authenticated using (user_id = auth.uid());
