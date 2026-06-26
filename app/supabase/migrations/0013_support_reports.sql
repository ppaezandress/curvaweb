-- Reportes de problemas del piloto (in-app). El equipo manda descripción + screenshot
-- opcional; solo el admin los lee (vía dashboard/service role). Privado por diseño:
-- no hay policy de SELECT para usuarios — únicamente pueden insertar el suyo.

create table if not exists public.support_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  page text,
  description text not null,
  screenshot text,            -- data URL (base64) opcional, comprimido en el cliente
  user_agent text,
  created_at timestamptz default now()
);

alter table public.support_reports enable row level security;
drop policy if exists "support_insert" on public.support_reports;
create policy "support_insert" on public.support_reports for insert to authenticated with check (true);
