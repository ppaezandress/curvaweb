-- CURVA Socios — verdad compartida (Fase 7).
-- Andrés y Balmo comparten los mismos proyectos, pagos, gastos y reglas.
-- La app NO usa Supabase Auth (el candado es HTTP Basic Auth en middleware.ts);
-- por eso las API routes acceden con SERVICE ROLE (salta RLS) y quedan protegidas
-- por el middleware. Dejamos RLS activo SIN políticas anon: la anon key no lee nada.
--
-- Guardamos cada proyecto como un blob JSONB (mismo shape que el modelo de la app,
-- Proyecto en lib/reparto.ts) para no migrar columna por columna cada vez que el
-- modelo crece (origen, pagos, plazo, IVA, estado...). Granularidad por-proyecto:
-- dos socios editando proyectos distintos nunca se pisan.

-- Un proyecto por fila (id = el mismo id de la app, tipo texto "p...").
create table if not exists socios_project (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Clave-valor para el resto del estado compartido: 'params', 'gastos', 'rulesVersion'.
create table if not exists socios_kv (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz not null default now()
);

alter table socios_project enable row level security;
alter table socios_kv enable row level security;
-- Sin políticas: solo el service role (server) puede leer/escribir. La anon key queda ciega.
