-- CURVA Tiempos — capa social (perfiles, mensajes, presencia, música)

-- Perfiles (1:1 con auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  avatar_url text,
  notion_user_id text,
  email text,
  created_at timestamptz default now()
);

-- Presencia / estado en vivo (un row por usuario)
create table if not exists public.presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_active boolean default false,
  current_task text,
  app_focus text,
  focus_tone text,
  track text,
  artist text,
  genres text[],
  updated_at timestamptz default now()
);

-- Log de música (para matches y recaps de equipo)
create table if not exists public.music_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  at timestamptz default now(),
  track text,
  artist text,
  genres text[],
  task_id text
);
create index if not exists music_log_user_at on public.music_log(user_id, at desc);

-- Canales y mensajes
create table if not exists public.channels (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null default 'team', -- team | dm
  created_at timestamptz default now()
);
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  channel_id bigint references public.channels(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  body text not null,
  kind text not null default 'user', -- user | system
  created_at timestamptz default now()
);
create index if not exists messages_channel_created on public.messages(channel_id, created_at);

-- Canal de equipo por defecto
insert into public.channels (name, kind)
select 'equipo', 'team'
where not exists (select 1 from public.channels where name = 'equipo');

-- Realtime
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.presence;

-- RLS
alter table public.profiles enable row level security;
alter table public.presence enable row level security;
alter table public.music_log enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;

-- Perfiles: todos los autenticados leen; cada quien edita el suyo
create policy "profiles_read" on public.profiles for select to authenticated using (true);
create policy "profiles_upsert_self" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_self" on public.profiles for update to authenticated using (auth.uid() = id);

-- Presencia: equipo lee; cada quien escribe la suya
create policy "presence_read" on public.presence for select to authenticated using (true);
create policy "presence_upsert_self" on public.presence for insert to authenticated with check (auth.uid() = user_id);
create policy "presence_update_self" on public.presence for update to authenticated using (auth.uid() = user_id);

-- Música: equipo lee; cada quien inserta la suya
create policy "music_read" on public.music_log for select to authenticated using (true);
create policy "music_insert_self" on public.music_log for insert to authenticated with check (auth.uid() = user_id);

-- Canales: todos los autenticados leen
create policy "channels_read" on public.channels for select to authenticated using (true);

-- Mensajes: autenticados leen; cada quien crea como sí mismo (o sistema)
create policy "messages_read" on public.messages for select to authenticated using (true);
create policy "messages_insert" on public.messages for insert to authenticated with check (user_id is null or auth.uid() = user_id);
