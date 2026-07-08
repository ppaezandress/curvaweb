-- Funciones tipo Slack en el chat: editar, borrar (suave), responder (cita) y fijar.

-- messages: marca de edición, borrado suave y respuesta a otro mensaje.
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists parent_id bigint references public.messages(id) on delete set null;
create index if not exists messages_parent on public.messages(parent_id);

-- Editar / borrar: solo el autor de su propio mensaje.
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Fijados del canal (cualquier miembro puede fijar/quitar; no toca la tabla messages).
create table if not exists public.message_pins (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.messages(id) on delete cascade,
  channel_id bigint not null references public.channels(id) on delete cascade,
  pinned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique (message_id)
);
create index if not exists message_pins_channel on public.message_pins(channel_id);
alter table public.message_pins enable row level security;

drop policy if exists "pins_read" on public.message_pins;
create policy "pins_read" on public.message_pins for select using (true);
drop policy if exists "pins_write" on public.message_pins;
create policy "pins_write" on public.message_pins for insert to authenticated with check (auth.uid() = pinned_by);
drop policy if exists "pins_delete" on public.message_pins;
create policy "pins_delete" on public.message_pins for delete to authenticated using (true);

-- Realtime para fijados (messages ya está en la publicación con todas las operaciones).
alter publication supabase_realtime add table public.message_pins;
