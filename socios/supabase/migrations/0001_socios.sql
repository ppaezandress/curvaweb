-- CURVA Socios — esquema base (source of truth de socios)
-- Corre en la MISMA Supabase de Curva Tiempos. Prefijo socios_ para no chocar.

-- Proyectos (cotización + reparto)
create table if not exists socios_projects (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  ticket numeric not null default 0,
  tipo text not null default 'trazo',
  caja_pct numeric not null default 10,
  comis_on boolean not null default true,
  comis_who text not null default 'banca',
  in_month boolean not null default true,
  members jsonb not null default '[]',
  cliente_id text,            -- page id del CRM de Notion
  cliente_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Gastos (overhead fijo + gastos de factura ligados a proyecto)
create table if not exists socios_gastos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  monto numeric not null default 0,
  proveedor text,
  fecha date,
  categoria text not null default 'overhead',   -- overhead | proyecto
  project_id uuid references socios_projects(id) on delete set null,
  factura_url text,           -- imagen en el bucket 'facturas'
  factura_json jsonb,         -- lo que extrajo Claude
  created_at timestamptz not null default now()
);

-- Reglas (perillas) — una sola fila
create table if not exists socios_reglas (
  id int primary key default 1,
  params jsonb not null default '{"alpha":60,"pool":12,"beta":0,"split":60,"ahorro":15,"imp":30}',
  updated_at timestamptz not null default now()
);
insert into socios_reglas (id) values (1) on conflict (id) do nothing;

-- RLS: solo usuarios autenticados (los socios). Afinar a ADMIN_EMAILS en un lote aparte.
alter table socios_projects enable row level security;
alter table socios_gastos enable row level security;
alter table socios_reglas enable row level security;
do $$ begin
  create policy socios_projects_auth on socios_projects for all to authenticated using (true) with check (true);
  create policy socios_gastos_auth on socios_gastos for all to authenticated using (true) with check (true);
  create policy socios_reglas_auth on socios_reglas for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Bucket de Storage para las imágenes de factura (crear en el dashboard o aquí):
-- insert into storage.buckets (id, name, public) values ('facturas','facturas', false) on conflict do nothing;
