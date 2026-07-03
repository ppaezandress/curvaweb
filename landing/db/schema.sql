-- CURVA — esquema de leads del chat (Supabase / Postgres).
-- Aplícalo en el SQL Editor de tu proyecto de Supabase.
-- Seguridad: RLS habilitado y SIN políticas públicas → solo la service-role key
-- (que usa el backend, y que bypassa RLS) puede leer/escribir. El cliente anónimo
-- no tiene acceso. NUNCA expongas la service-role key en el frontend.

create table if not exists public.curva_leads (
  email       text primary key,
  source      text,
  first_seen  timestamptz not null default now()
);

create table if not exists public.curva_chat_messages (
  id          bigint generated always as identity primary key,
  email       text not null references public.curva_leads(email) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

-- Índice para leer la conversación de un lead en orden.
create index if not exists curva_chat_messages_email_created_idx
  on public.curva_chat_messages (email, created_at);

-- RLS: encendido, sin políticas → cerrado a anon/authenticated (service-role bypassa).
alter table public.curva_leads          enable row level security;
alter table public.curva_chat_messages  enable row level security;

-- Endurecer: quitar cualquier grant por defecto a roles públicos.
revoke all on public.curva_leads         from anon, authenticated;
revoke all on public.curva_chat_messages from anon, authenticated;
