# CURVA Tiempos — HANDOFF (estado completo)

> App de **medición de tiempo + gestión de tareas + capa social** para el equipo de CURVA, conectada a Notion. Meta: producto interno hoy, **SaaS** después.
> Última actualización: 2026-06-24. Repo: **`ppaezandress/curvaweb`**, carpeta **`/app`** (la landing Astro vive en `/landing`).

## 🔴 ESTADO ACTUAL — 2026-07-03 (leer ANTES que el resto; supersede detalles viejos abajo)

Auditoría completa (5 dimensiones) + remediación en 3 olas. **Build + tsc limpios.** Migraciones 0001–0020 EXISTEN en `supabase/migrations/`; la navegación vieja (Reportes/Recap/Rachas) hoy **redirige** vía `next.config.ts` a `/equipo` y `/momentos` (ignora referencias antiguas a esas rutas). `main` sincronizado con origin.

**Ola 1 — Seguridad + dato central (hecha):**
- **Guard de sesión** en todas las APIs sensibles: `lib/auth/guard.ts` (`requireSession` + `getPersona`), aplicado en `tasks`, `time-entries`, `data`. Las escrituras anónimas y el IDOR quedaron cerrados (verificado: 401/403 sin sesión). `time-entries` POST fuerza la persona del usuario logueado (no el `userName` del body); GET redacta las horas ajenas para no-admin (conserva persona+fecha para rachas). `timing/*` → 403 mientras `PILOT.aiTime` esté OFF.
- **Doble conteo de tiempo ARREGLADO**: `TimeEntry` ahora lleva `posted`/`synced`/`notionId`. `sessionSecondsForTask` suma solo `!synced`; `NotionSync` confirma la escritura (deja de perder tiempo en silencio) y al refrescarse el baseline se marca `synced` (reconciliación en `app-context.reconcileEntries`, disparada desde `NotionSync` al cambiar `tasks`). `loggedSecondsToday` filtra por hoy local (`dayKey`). Guard stale de 8h también para timers de IA.
- **Fechas UTC**: `dashboard`, `curvi/engine` y `ManualEntryModal` usan `dueDateMs()`/`dayKey()` local.

**Ola 2 — Fiabilidad/perf (hecha):**
- **Caché Notion**: `getCurvaData`/`getTimeRecords` en `unstable_cache` (revalidate 60s, tags `curva-data`/`time-entries`); invalidación con `revalidateTag(tag,"max")` tras escribir (tasks y time-entries). Carga caliente ~3.3s → <100ms.
- **Retry/backoff 429/5xx** en `notionFetch` (respeta `Retry-After`).
- **Gates de polling**: `AITodayCard` y `AILiveProvider` ya no pollean con `aiTime` OFF.
- **`getTimeRecords`** filtra a los últimos 180 días.

**Ola 3 — Pulido UX (hecha):** `Modal.tsx` con `role="dialog"`+focus-trap+aria; dock (`TaskSwitcher`) ya no tapa `BottomNav` en móvil; acciones solo-hover visibles en táctil; `statusToneClass` y neutros zinc → tokens theme-aware; estado de carga con logo+spinner. Pendiente (cola larga, baja prioridad): semánticos hardcodeados restantes en paneles poco vistos (settings, algunos detalles de dashboard/insights).

**Pendiente de TU lado:** correr `supabase/APLICAR-pendientes.sql` / verificar 0019-0020 en prod; reglas de Vercel Firewall (rate limiting); commit/push. Rate limiting NO está en código (Vercel serverless no comparte memoria).

## 🆕 Sesión 2026-06-24 (4 mejoras post-demo — leer primero)
Build limpio. Plan: `~/.claude/plans/crea-un-plan-mode-sorted-cosmos.md`. Cuatro hitos del feedback de la junta donde se mostró la app:
1. **Toggle "Tiempo con IA"** (sesión previa, ya pusheado): opt-in en Ajustes→Integraciones (`aiEnabled` en `lib/app-context.tsx`, clave `curva.aiEnabled.{userId}`, default OFF). Apaga toda la UI de IA + `AISync`.
2. **Modo oscuro**: tokens semánticos en `app/globals.css` — `@theme inline` con `--color-fg/muted/surface/surface-2/line` que apuntan a vars de runtime que cambian bajo `.dark`; `ink/ink-soft/cloud` quedan FIJOS (píldoras/scrims). Sweep mecánico `bg-white→bg-surface`, `text-ink→text-fg`, `text-zinc-*→text-muted`, `bg-zinc-50/100→bg-surface-2` en ~34 archivos. Script anti-FOUC inline en `app/layout.tsx`. Hook `lib/use-theme.ts` (device-level, `curva.theme` = light/dark/system). Selector en `components/settings/AccountSettings.tsx`. Validado en login (claro+oscuro) con Playwright.
3. **Mes a mes en Insights**: segmentado Semanas|Meses en la tarjeta Tendencia (`insights/page.tsx`, `trendMonthsData` = últimos 6 meses). Helpers `firstDayOfMonth`/`monthShort` en `lib/date.ts`.
4. **Co-working en vivo**: `lib/use-coworking.tsx` (provider montado en `(app)/layout`) detecta por `presence.current_task_id` quién trabaja la misma tarea AHORA; al terminar el solape registra `coworking_sessions` (dedup: solo el uuid menor escribe). Badge "👥 con X" en el dock (`TaskSwitcher` ManualRow). Tarjeta "Trabajo en equipo" en Insights. **Total compartido vive en Supabase, NO se suma a Notion** (sin doble conteo).
5. **Kudos** (depende de co-working): `components/KudosCard.tsx` en Recap — tras ≥30 min juntos en la semana, mándale buena onda a un compañero (`peer_feedback`); abajo "Te mandaron buena onda". RLS: lees solo lo que recibiste/enviaste, nunca de terceros. Solo positivo.

### ⚠️ PENDIENTE BLOQUEANTE: aplicar migraciones
`0008_coworking.sql` (col `presence.current_task_id` + tabla `coworking_sessions`) y `0009_peer_kudos.sql` (`peer_feedback`) **NO están aplicadas** (el clasificador bloqueó psql a prod). Sin ellas, co-working y kudos no funcionan. Aplicar con el método de "Esquema Supabase" de abajo o el SQL editor del dashboard. Tampoco se ha pusheado nada de esta sesión.

## 🆕 Sesión 2026-06-22 (lo más reciente — leer primero)
Hay **9 commits locales en `main` SIN PUSHEAR** (el clasificador bloquea push directo a main; el usuario debe autorizar `git push origin main`). Build limpio. Lo construido:
- **Navegación a 4 destinos**: Hoy · Tareas · Mensajes · **Análisis**. Route groups `(analytics)` (Insights/Reportes/Rachas/Recap) y `(work)` (Tareas/Semana) con sub-tabs (`components/SegmentedNav.tsx`). Sin botón "Más".
- **Insights + "CURVA Wrapped"** (`(analytics)/insights`): KPIs con delta, tendencia, ritmo, concentración de clientes, superlativos del equipo, **perfil personal anti-vigilancia** (lente "Yo"), y **desglose Manual vs IA + Aprovechamiento**.
- **Cronómetro paralelo Manual + IA** (`lib/app-context.tsx`): `aiActive[]` (N relojes IA en paralelo al manual), flag `silent` (IA del conector no duplica registro), auto-resume. Dock rediseñado (`TaskSwitcher`: zonas "A mano / IA en paralelo / En pausa"). Botón ✨IA en `TaskCard`.
- **Modal "Registrar tiempo"** (`ManualEntryModal`): horario **de hora a hora** con **timeline interactiva arrastrable** (no "duración").
- **Campos nuevos en Notion** (ya creados): `Modo` (Select Manual/IA en *Registro de Tiempo*), `Tipo`, `Peso` (Ligera/Media/Pesada), `Interno` (checkbox) en *Tasks Tracker*. Leídos en `fetchers.ts`, escritos en `/api/tasks` y `/api/time-entries`.
- **Motor de recomendaciones** (`CoachPanel` en Hoy): mentalización del día (`/api/gcal/day`), alertas (vencidas/atrasadas/nuevas), "tengo 1 hora", chips de contexto.
- **Tareas internas** (cliente opcional, toggle + filtro "Interno").
- **Espacio de Ajustes** (`/ajustes` desde el avatar/ProfileMenu): Cuenta · Integraciones · Plan (placeholder) · Privacidad. Las tarjetas de conexión se movieron del dashboard aquí.
- **🌟 Conectores de captura automática de IA (el diferenciador):**
  - **Claude Code**: hooks en `~/.claude/settings.json` → `/api/timing/{start,stop}`. **USAR `type:"command"` (curl), NO `type:"http"` (no dispara en Claude Code v2.1.185).** Token = correo en header `x-curva-user`. Registra Modo IA en Notion (`lib/notion/time.ts` `logAITime`).
  - **Claude Desktop**: watcher `app/tools/claude-desktop-watcher.mjs` (vigila `~/Library/Application Support/Claude/local-agent-mode-sessions/`, **solo metadatos**) → `/api/timing/desktop` (dedup). Correr con **ruta absoluta**: `node /Users/andrespaez/Documents/curva/app/tools/claude-desktop-watcher.mjs`. Guard de backfill 2h.
  - **Tiempo de IA EN VIVO** (push, Supabase Realtime): `lib/realtime.ts` (broadcast desde server) + `lib/use-ai-live.tsx` (`AILiveProvider`, **canal único** "ai-live"). `AITodayCard` (tarjeta "Tiempo con IA") y `AISync` (al usar Claude Code la tarea activa pasa a IA; al terminar queda **en pausa**; al **mover el mouse** reanuda manual). Validado end-to-end.

### Gotchas nuevos
- Hooks de Claude Code: **`type:"command"`** (curl `--data-binary @-`), no `http`.
- Watcher de Desktop: **ruta absoluta** (si lo corres desde `~` falla MODULE_NOT_FOUND).
- El estado del cronómetro/IA vive en **localStorage por dispositivo** (NO sincroniza entre equipos). Solo los **registros terminados** van a Notion.
- **Un solo canal Realtime** "ai-live" (vía `AILiveProvider`) — varios suscriptores al mismo topic se pisan.
- Hay un **`app.zip` suelto** en la raíz del repo que NO debe commitearse.

### Pendientes / próximos pasos
- **Pushear** los 9 commits (`git push origin main`).
- **Notion (datos)**: asignar `Tipo` a las tareas (0/337 clasificadas) y vincular `Cliente` en los **Proyectos** (solo 9/35) para que Reportes por cliente/tipo se vean.
- **Fase 2 — app de escritorio (Tauri)**: captura de actividad **manual real** (foco de apps fuera del navegador) para el "manual en vivo" verdadero (estilo Rize/RescueTime).
- **SaaS**: multi-tenant (datos en Supabase, no en el Notion de CURVA), onboarding self-serve, billing real (hoy placeholder).

## Cómo correr
```bash
cd /Users/andrespaez/Documents/curva/app
npm run dev    # SIEMPRE abrir en http://127.0.0.1:3000  (NO localhost — ver gotcha cookies)
npm run build  # debe compilar limpio
```
Login: **código de equipo `CURVA`** + correo (el que está en Notion) + contraseña. 1ª vez crea la cuenta sola y se auto-mapea por correo.

## Stack
- **Next.js 16.2.9** (Turbopack) + React 19 + **Tailwind v4** (`@theme` en `app/globals.css`) + TypeScript.
- **Supabase** (auth, Postgres, RLS, Realtime, Storage) — `@supabase/ssr`, `@supabase/supabase-js`.
- **Notion API** (REST 2022-06-28) — fuente de verdad de tareas/clientes/proyectos/equipo/tiempos.
- **Spotify** + **Google Calendar** OAuth (cookies httpOnly por usuario).
- Tauri v2 (app de escritorio, cronómetro en barra de menú) — en `/app` también.
- ⚠️ **AGENTS.md**: esta versión de Next tiene cambios disruptivos; leer `node_modules/next/dist/docs/` antes de tocar APIs de Next.

## Identidad / Design system (workstream A)
- **Híbrido sobrio + cultura**: base limpia tipo Linear/Revolut, UN acento `curva-purple`; el gradiente/color solo en cultura (música, rachas, celebración, cronómetro activo).
- `app/globals.css`: tokens (curva-*, ink, line, **spotify**, ease-curva), `.focus-ring`, `.safe-bottom`, animaciones (`.rise`, `.modal-fade`, `.modal-pop`), `prefers-reduced-motion`.
- `components/ui/`: `Button`/`IconButton`, `Card`, `Badge`/`StatusBadge`, `Chip`, `StatCard`, `EmptyState`, `SectionHeader`. Úsalos en vez de estilos ad-hoc.
- Utilidades únicas (NO duplicar): `lib/task-status.ts` (`isDone`, `isActionable`, `isAssignedTo`), `lib/date.ts` (`mondayOf`, `monthLabel`, `DIAS_CORTOS`), `lib/format.ts` (duración/clock/horas, `hhmmFromMs/ISO`, `initials`), `lib/cn.ts`.
- `components/Avatar.tsx`: unificado, soporta foto (`src`) o iniciales+color.

## Navegación (workstream B)
- `TopNav` (desktop): Inicio, Tareas, Mensajes, Semana, Reportes, Rachas, Recap + `ProfileMenu` (avatar → cambiar foto / cerrar sesión).
- `BottomNav` (móvil): 4 directos (Inicio/Tareas/Mensajes/Reportes) + hoja **"Más"** (Semana/Rachas/Recap).
- Home (`dashboard`): claim "Mide el tiempo de tus tareas", command bar (crear/buscar tarea), 2 acciones primarias, conexiones (Spotify/Calendar), stats, WeekProgress, "Para hoy".

## Núcleo: tiempo + tareas
- Datos reales de Notion vía `/api/data` (`lib/notion/fetchers.ts` → `getCurvaData`). Member expone `email` (auto-login) y las tareas exponen `responsableIds[]`/`auxiliarIds[]` (una tarea puede tener varios; **"es mía" = `isAssignedTo`**).
- Cronómetro multi-tarea en `lib/app-context.tsx` (play/pause/switch, idle review opt-in sin vigilancia).
- **Iniciar (play) cambia el estatus de Notion a "EN CURSO"** si estaba sin empezar (`TaskCard.start` → PATCH `/api/tasks`). Marcar Done → "DONE" + celebración.
- `/api/time-entries` registra en Notion (modo cronómetro o modo asistentes = N filas). `/api/tasks` crea (POST, default "SIN EMPEZAR") y actualiza estatus (PATCH).

## Capa social (Supabase) — migración 0001
- **Auth**: email+password, alta confirmada server-side (`/api/auth/register` con service key). Auto-mapeo por correo (member.email == login). HostGuard redirige localhost→127.0.0.1.
- **Mensajes (Chat 2.0)** `/mensajes`: canal `equipo` + **canales propios** + **DMs** + **reacciones**, todo realtime. Composer: **`@` menciona personas**, **`/` menciona tareas** (chip → abre la tarea en Notion). Panel de presencia a la derecha.
  - Migraciones 0004/0005: `channel_members`, `message_reactions`, `created_by`; RLS por membresía con `can_see_channel` (SECURITY DEFINER). GOTCHA: el creador debe ver su canal (created_by en RLS) o el INSERT...RETURNING lo bloquea.
- **Presencia** (`PresenceHeartbeat`, cada ~20s): activo/tarea/app/canción + **"📅 En junta"** (Calendar). `TeamPresence` lo muestra. Match musical (mismo artista → mensaje de sistema).
- **Rachas** `/rachas` (`lib/streaks.ts`): modo L-V + escudos, leaderboard, medallas (desde Notion, sin backend).
- **Fotos de perfil**: bucket `avatars` (migración 0003), `ProfileMenu` sube.

## Spotify (por usuario)
- `lib/spotify.ts` + `app/api/spotify/{login,callback,now}`. Cookie `sp_refresh` httpOnly. `SpotifyConnect` en Home. Alimenta presencia/match/recap.

## Google Calendar (privado)
- `lib/gcal.ts` + `app/api/gcal/{login,callback,now,events,logout}`. Cookie `gc_refresh`. Scope **`calendar.events.readonly`** (lee TUS eventos; el equipo solo ve "En junta", nunca títulos).
- `GcalConnect` en Home (Reconectar/Desconectar). **Auto-registro de juntas**: `MeetingWatcher` (en `(app)/layout`) detecta junta terminada (≥10 min, con asistentes/Meet) → modal: proyecto sugerido por título (`lib/meeting-match.ts`) + asistentes del equipo → registra tiempo (modo asistentes). Anti-repetición en localStorage.
- SETUP: requiere `GOOGLE_CLIENT_ID`/`SECRET` (Google Cloud, OAuth web, redirect `http://127.0.0.1:3000/api/gcal/callback`, scope events.readonly, usuarios de prueba). Ya configurado en `.env.local`.

## Fotos de tareas → Recap (migración 0007)
- Botón de cámara en cada `TaskCard` → `TaskPhotos`: **cámara automática** (getUserMedia) + ícono para subir archivo; preview con **comentario + emojis** → **Enviar**. Bucket `task-photos`.
- Las fotos van al **Recap → "Fotos del equipo"** (compartidas): muestran tarea, comentario, autor, **hora + emoji por momento del día** (🌅 amanecer / ☀️ mañana / 🌤️ tarde / 🌆 atardecer / 🦉 noche / 🌙 madrugada), y **al picarlas abren la tarea en Notion** (`lib/notion-url.ts`).

## Esquema Supabase (migraciones en `app/supabase/migrations/`)
0001 social (profiles, presence, music_log, channels, messages) · 0002 unique member · 0003 avatars · 0004 chat (channel_members, reactions) · 0005 channel creator visibility · 0006 presence.in_meeting · 0007 task_photos.
Proyecto Supabase ref: `aafbrygvgkiynpmmihbt`. Conexión directa para migraciones: `host=db.<ref>.supabase.co port=5432 user=postgres sslmode=require` + `PGPASSWORD=$SUPABASE_DB_PASSWORD`.

## GOTCHAS críticos
- **Abrir SIEMPRE en `127.0.0.1:3000`** (las cookies OAuth viven ahí; localhost = otro sitio → "desconectado"). HostGuard lo fuerza.
- **Modales con Portal** (`components/Modal.tsx` usa `createPortal` a body): si no, un ancestro con `transform` (animación `.rise`) recorta el backdrop `fixed` a un rectángulo feo.
- **`ppaezandress@gmail.com` tiene la contraseña REAL de Andrés** (NO `curva1234`). Para QA con Playwright usar OTROS correos de miembro (eivana.gardunomayo@, emilianolombarderoduo@) con `curva1234` y **limpiarlos después** (la data es de PRODUCCIÓN).
- Notion token = `CURVA_NOTION_TOKEN` (no `NOTION_TOKEN`, que lo pisaba el `.zshrc`).
- members se deriva de personas asignadas en tareas; quien no tenga tareas no aparece (a futuro: leer Team Tracker completo).
- `.claude/skills` está gitignored (tooling del agente, no va al repo).

## QA / testing
- Skill `webapp-testing` (Playwright headless). Para cámara: args `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` + `permissions=["camera"]`.
- Última regresión: 7 rutas desktop+móvil, 0 errores de consola, sin overflow.

## Pendiente / roadmap
- Insights/"CURVA Wrapped" (skills `metrics-review`, `build-dashboard`, `data-visualization`, `statistical-analysis` ya instaladas en `app/.claude/skills`).
- **"Entrar con Notion"** (OAuth) → salto multi-tenant SaaS (cada empresa conecta su Notion).
- Deploy a Vercel para el equipo (segundo proyecto, Root Dir `app`).
- Calendar producción: webhooks (en vez de polling), Google Workspace a nivel organización, Spotify Extended Quota >25 users.
- Campo "Tipo de entregable" en Notion Tasks Tracker (para pricing por tipo).
