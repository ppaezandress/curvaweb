# CURVA Tiempos — HANDOFF (estado completo)

> App de **medición de tiempo + gestión de tareas + capa social** para el equipo de CURVA, conectada a Notion. Meta: producto interno hoy, **SaaS** después.
> Última actualización: 2026-06-21. Repo: **`ppaezandress/curvaweb`**, carpeta **`/app`** (la landing Astro vive en `/landing`).

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
