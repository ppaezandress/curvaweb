# Sprint 2 — Voltear la arquitectura (Notion → Postgres)

> Diseño para revisar/aprobar ANTES de tocar código de auth/RLS o la BD. Es el sprint más delicado del plan. Nada destructivo se aplica sin tu OK explícito.

## Principio
**Postgres (Supabase) es la fuente de verdad de eventos, tiempos y sesiones.** Notion es la fuente de verdad de la **metadata de tareas que los humanos editan ahí** (nombre, status, asignados). Se sincronizan, pero **NUNCA se calcula contra Notion**. Resultado: analítica rápida, multi-tenant, completitud de datos, camino a ML, y Notion como **wedge opcional de onboarding** — no un punto único de falla.

## Esquema (Postgres) — TODO lleva `org_id` + RLS por organización
```
organizations(id pk, name, notion_workspace_id, plan, created_at)
org_members(org_id fk, user_id=auth.uid, notion_user_id, role[owner|admin|member], created_at)
  -- extiende la tabla profiles existente (id, name, avatar_url, notion_user_id, email)

clients(id pk, org_id fk, notion_page_id unique, name, synced_at)         -- desde CRM-Curva
projects(id pk, org_id fk, notion_page_id unique, name, client_id fk, synced_at)  -- desde Planeación

tasks(
  id pk, org_id fk, notion_page_id unique nullable,  -- null = tarea nativa de CURVA
  name, status, type, weight, priority,
  responsable_id, auxiliar_ids[],                     -- mapeados a org_members vía notion_user_id
  client_id fk, project_id fk, due_date, internal, baseline_seconds,
  created_at, updated_at, synced_at)

time_entries(                                         -- ★ EL sistema de registro
  id pk, org_id fk, task_id fk, user_id fk,
  started_at, ended_at, minutes, inactive_minutes,
  mode[manual|ai|passive], source[timer|gcal|git|notion_status|tauri|hooks],
  confirmed bool default false, created_at)

sync_state(org_id fk, resource[tasks|clients|projects], last_cursor, last_synced_at, status)
```
Las tablas Supabase que ya existen (`presence`, `channels`, `messages`, `message_reactions`, `music_log`, `task_photos`, `coworking_sessions`, `peer_feedback`, `timer_sessions`) solo reciben **`org_id`** para multi-tenant.

## RLS (la base de la confianza, Sprint 5)
- Toda tabla: el usuario solo ve filas de **sus** orgs (`org_id ∈ orgs del usuario`).
- `time_entries`: a nivel fila, **solo el dueño** lee su crudo (`user_id = auth.uid()`). El equipo ve tiempos **solo vía vistas/RPC agregadas** (con cohorte mínima, Sprint 5). Reusar el patrón `SECURITY DEFINER` que ya existe (`can_see_channel()`) para evitar recursión.

## Adaptador de sync bidireccional (Notion)
- **Pull (Notion → Postgres):** al conectar, jala tareas/clientes/proyectos y hace upsert por `notion_page_id`. Después, **poll periódico** de páginas cambiadas desde `last_cursor` (respeta rate limit Notion: cola + backoff, ≤3 req/s). Vive en `lib/notion/fetchers` + un route/job nuevo.
- **Write-back (Postgres → Notion):** al confirmar un `time_entry`, escribe el registro en la base "Registro de Tiempo" de Notion (como hoy `/api/time-entries`) para que el rollup `Horas registradas` siga vivo. Agrupa para no saturar.
- **Dirección por campo (conflictos):** Notion gana en metadata editada por humanos (nombre, status, asignados). Postgres gana en tiempo. 
- **Degradación con gracia:** si Notion no responde, la app **sigue funcionando** sobre Postgres; el sync reintenta.

## Plan de corte (additivo, reversible, sin downtime)
1. **Crear el esquema nuevo** (additivo, junto a lo actual). Nada se borra.
2. **Backfill:** un pull completo Notion → Postgres llena `clients/projects/tasks`.
3. **Doble-lectura tras bandera:** `data-context` lee de Postgres con **fallback a Notion** detrás de un flag (`NEXT_PUBLIC_SOURCE=postgres|notion`). Se valida en paralelo.
4. **Doble-escritura:** crear/editar tarea y registrar tiempo escriben a Postgres **y** hacen write-back a Notion.
5. **Cutover:** cuando Postgres está validado, el flag pasa a `postgres`. Notion queda como sync/wedge. Reversible bajando el flag.

## Por qué necesito tu decisión antes de codear
- **Aplicar el esquema toca la BD de producción** (con la data real del equipo) y la migración añade RLS/permisos → tu plan dice "pregunta antes de auth/RLS".
- No puedo aplicar migraciones a prod (guardrail). Y las pendientes (0008–0010) aún no corren, así que **no podría verificar** nada del flip.

## Lo que SÍ puedo hacer sin riesgo mientras decides
- Escribir las migraciones del esquema (archivos, **sin aplicar**).
- Construir el adaptador de sync y la doble-lectura **detrás del flag** (Notion sigue siendo primario por defecto → nada se rompe).
- Endurecer los boundaries con validación (Zod) en `/api/tasks` y `/api/time-entries`.
