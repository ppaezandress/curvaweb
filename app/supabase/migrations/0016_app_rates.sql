-- Tarifas por hora compartidas entre admins (antes vivían en localStorage por-dispositivo,
-- así un admin no veía las que ponía el otro). key = nombre de persona o '__default__'.
create table if not exists public.app_rates (
  key text primary key,
  rate numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.app_rates enable row level security;

-- Es data de costo: solo los admins (profiles.is_admin) pueden leer y escribir.
drop policy if exists "app_rates_admin_all" on public.app_rates;
create policy "app_rates_admin_all" on public.app_rates
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
