-- Bitácora de errores del servidor (ver lib/observability.ts). Hasta ahora los errores de
-- las rutas API se tragaban en `catch {}` mudos: nos enterábamos por screenshot del equipo,
-- días después. Aquí quedan persistidos y consultables.
--
-- Escritura: SOLO service role (el cliente admin, que hace bypass de RLS) — un error puede
-- ocurrir sin sesión, y nadie desde el navegador debe poder inyectar filas aquí.
-- Lectura: solo admins.
create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  level text not null default 'error',
  scope text not null,
  message text not null,
  fingerprint text not null,
  stack text,
  meta jsonb,
  user_id uuid references auth.users(id) on delete set null,
  release text
);

-- Consultas típicas: "lo último que falló" y "qué está fallando más".
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
create index if not exists app_errors_fingerprint_idx on public.app_errors (fingerprint, created_at desc);

alter table public.app_errors enable row level security;

-- Solo admins leen. Sin policies de insert/update/delete: nadie con anon key escribe aquí.
drop policy if exists app_errors_select_admin on public.app_errors;
create policy app_errors_select_admin on public.app_errors
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
