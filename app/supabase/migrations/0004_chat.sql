-- CURVA Tiempos — Chat 2.0: canales propios, DMs, reacciones, membresía

-- Quién creó el canal
alter table public.channels add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Miembros de un canal (para canales 'channel' y 'dm'; 'team' es público)
create table if not exists public.channel_members (
  channel_id bigint references public.channels(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (channel_id, user_id)
);

-- Reacciones a mensajes
create table if not exists public.message_reactions (
  id bigint generated always as identity primary key,
  message_id bigint references public.messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists reactions_message on public.message_reactions(message_id);

-- ¿El usuario actual puede ver este canal? (SECURITY DEFINER evita recursión de RLS)
create or replace function public.can_see_channel(cid bigint)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.channels c where c.id = cid and c.kind = 'team')
      or exists (select 1 from public.channel_members m where m.channel_id = cid and m.user_id = auth.uid());
$$;

alter table public.channel_members enable row level security;
alter table public.message_reactions enable row level security;

-- Canales: ver 'team' o donde soy miembro; crear como yo mismo
drop policy if exists "channels_read" on public.channels;
create policy "channels_read" on public.channels for select to authenticated
  using (kind = 'team' or public.can_see_channel(id));
drop policy if exists "channels_insert" on public.channels;
create policy "channels_insert" on public.channels for insert to authenticated
  with check (auth.uid() = created_by);

-- Mensajes: leer/crear solo en canales que puedo ver
drop policy if exists "messages_read" on public.messages;
create policy "messages_read" on public.messages for select to authenticated
  using (public.can_see_channel(channel_id));
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
  with check ((user_id is null or auth.uid() = user_id) and public.can_see_channel(channel_id));

-- Membresía: ver la de mis canales; agregarme yo o el creador agrega a otros
create policy "members_read" on public.channel_members for select to authenticated
  using (public.can_see_channel(channel_id));
create policy "members_insert" on public.channel_members for insert to authenticated
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.channels c where c.id = channel_id and c.created_by = auth.uid())
  );
create policy "members_delete" on public.channel_members for delete to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.channels c where c.id = channel_id and c.created_by = auth.uid())
  );

-- Reacciones: ver las de mensajes visibles; gestionar las mías
create policy "reactions_read" on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.can_see_channel(m.channel_id)));
create policy "reactions_insert" on public.message_reactions for insert to authenticated
  with check (auth.uid() = user_id);
create policy "reactions_delete" on public.message_reactions for delete to authenticated
  using (auth.uid() = user_id);

-- Realtime (idempotente)
do $$ begin alter publication supabase_realtime add table public.message_reactions; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.channels; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.channel_members; exception when others then null; end $$;
