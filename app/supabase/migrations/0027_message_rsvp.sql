-- RSVP en el chat: responder "voy / no voy / tal vez" a un mensaje de junta.
-- Es coordinación del equipo dentro del chat (no toca el RSVP de Google Calendar).
create table if not exists public.message_rsvp (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('yes', 'no', 'maybe')),
  created_at timestamptz default now(),
  primary key (message_id, user_id)
);
alter table public.message_rsvp enable row level security;

drop policy if exists "rsvp_read" on public.message_rsvp;
create policy "rsvp_read" on public.message_rsvp for select using (true);
drop policy if exists "rsvp_upsert" on public.message_rsvp;
create policy "rsvp_upsert" on public.message_rsvp for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "rsvp_update" on public.message_rsvp;
create policy "rsvp_update" on public.message_rsvp for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "rsvp_delete" on public.message_rsvp;
create policy "rsvp_delete" on public.message_rsvp for delete to authenticated using (user_id = auth.uid());

do $$ begin alter publication supabase_realtime add table public.message_rsvp; exception when others then null; end $$;
