# CURVA · Tiempos — Estado del proyecto y handoff

> Última sesión: **2026-06-18**. Este documento resume TODO lo que se construyó para poder retomar después sin perder contexto.

---

## 1. Qué es esto

Herramienta de **medición de tiempos** para el equipo de CURVA (consultoría de Andrés Páez).
Cada consultor entra con su usuario, le da **play/stop** a una tarea, y se registra cuánto tiempo
toma cada cosa — **por persona, proyecto y tipo de entregable**. Objetivo real: saber **cuánto
cuesta cada tipo de trabajo para fijar precios** + cultura de medición (NO vigilancia).

Vive en el **mismo repo** que la landing de CURVA (`ppaezandress/curvaweb`):

```
curva/
  landing/   → la página pública (Astro)        → (Vercel proyecto aparte)
  app/        → ESTA herramienta (Next.js + Tauri)  ← aquí estamos
```

---

## 2. Decisiones tomadas (con Andrés)

- **Plataforma aparte de la landing**, pero en el mismo repo (monorepo).
- **Nivel de medición:** "Confianza + contexto de apps" (cronómetro + aviso de inactividad +
  detección de app en foco). **Sin** screenshots ni keylogging. Cultura: *medición, no vigilancia*.
- **Empezar por:** PWA/web → app de escritorio (Tauri) → (después) backend.
- **No** hay dominio propio todavía. **No** hay costo/hora por persona (la herramienta ayudará a medirlo).
- Notion es el "cerebro" real (Tasks Tracker / Team Tracker / CRM / Planeación). La herramienta
  será una **capa de cronómetro encima** de lo que ya vive en Notion (cuando se conecte).
- Falta agregar un campo **"Tipo de tarea / área"** al Tasks Tracker de Notion (clave para el pricing).

---

## 3. Qué está CONSTRUIDO y funcionando

### Frontend (Next.js 16 + React 19 + Tailwind v4 + Outfit)
- **Login** = selector de usuario (Google "próximamente").
- **Dashboard:** héroe "Ahora" (cronómetro grande cuando corre / KPIs cuando no), tareas
  agrupadas por proyecto, toggle Mis tareas / Todas, panel "Lo que registraste hoy".
- **Reportes:** KPIs (tiempo total, proyecto más caro, entregable más costoso) + barras por
  tipo de entregable / proyecto / persona.
- **Idle nudge:** detecta inactividad y pregunta "¿sigues trabajando?" → conservar / descartar.
- **PWA:** instalable (manifest + service worker + íconos de marca).
- Datos = **de prueba** (`lib/mock-data.ts`), se reemplazan por Notion en Fase B.

### App de escritorio (Tauri v2 — `src-tauri/`)
- **Cronómetro en la barra de menú** del Mac (visible aunque estés en otra app).
- **Menú del tray:** Abrir CURVA / Detener cronómetro / Salir.
- **Notificaciones:** recordatorio de sesión larga + aviso de inactividad (con sonido).
- **Idle del SISTEMA** (todo el Mac, no solo la ventana) → trabajar en otra app ya no marca inactivo.
- **Contexto de app en foco** (incluye sitio dentro del navegador, ej. "Atlas · YouTube") —
  requiere permiso de **Accesibilidad**; degrada a solo-app si no se concede.
- **Logo de CURVA** en Dock / Launchpad / Aplicaciones.
- **Instalador `.dmg` generado** (ver sección 6).

---

## 4. Cómo correrlo (desarrollo)

Necesitas Rust en PATH (ya instalado vía rustup):
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd ~/Documents/curva/app

# Solo la web:
npm run dev               # http://localhost:3000

# La app de escritorio (necesita la web corriendo en :3000):
npx tauri dev
```

## 5. Cómo generar el instalador (.dmg)
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd ~/Documents/curva/app
npx tauri build
# Resultado:
#   src-tauri/target/release/bundle/dmg/CURVA Tiempos_0.1.0_aarch64.dmg
#   src-tauri/target/release/bundle/macos/CURVA Tiempos.app
```

## 6. Instalar la app
1. Abrir el `.dmg` → arrastrar **CURVA Tiempos** a **Aplicaciones**.
2. 1ª vez (sin firma): clic derecho → **Abrir** → Abrir.
3. Permisos opcionales: **Notificaciones** (Permitir) y **Accesibilidad** (para ver el sitio
   dentro del navegador) en Ajustes → Privacidad y seguridad.

---

## 7. Mapa de archivos clave

```
app/
  app/
    layout.tsx                 raíz (fuente Outfit + AppProvider)
    page.tsx                   redirige a /dashboard (client, compatible con export)
    manifest.ts                PWA manifest (force-static)
    login/page.tsx             selector de usuario
    (app)/layout.tsx           guard de sesión + nav + barra activa + IdleNudge + DesktopBridge
    (app)/dashboard/page.tsx   dashboard
    (app)/reportes/page.tsx    reportes
  components/
    NowHero, TaskCard, RecentSessions, ActiveTimerBar, TopNav,
    IdleNudge, DesktopBridge, TypeIcon, Avatar, Logo
  lib/
    app-context.tsx            cerebro: sesión + cronómetro + idle + focus (localStorage)
    mock-data.ts               datos de prueba (equipo/CRM/proyectos/tipos/tareas)
    app-category.ts            categorizeFocus(app, title) → work/distraction/neutral
    format.ts                  formato de tiempo
  src-tauri/
    src/lib.rs                 tray, menú, comandos: set_tray_title, system_idle_seconds, frontmost_app
    tauri.conf.json            config (ventana, devUrl, beforeBuildCommand, identifier vc.curva.tiempos)
    Cargo.toml                 deps: tauri(tray-icon), notification, user-idle
    capabilities/default.json  permisos (core, event, notification)
  next.config.ts               output: "export" (para empaquetar en Tauri)
```

---

## 8. PENDIENTE (próximos pasos)

### Fase B — Backend real (lo más importante para que sea "de verdad")
- **Supabase** (reusar el patrón de `~/Documents/porra`): auth Google + base de datos como
  fuente de verdad de las sesiones de tiempo, + **sync a Notion** para visualizar.
- **Conectar Notion** (Andrés está consiguiendo el acceso): reemplazar `lib/mock-data.ts` por
  lecturas reales del workspace "CURVA - Centro de Control".
- Agregar campo **"Tipo de tarea"** al Tasks Tracker de Notion.

### Pulido de la app de escritorio
- **Auto-arranque** al prender el Mac.
- **Firma + notarización** para repartir el `.dmg` al equipo sin el aviso de Gatekeeper.
- **Persistir** el dato de "app en foco" en cada registro (hoy solo se muestra).

### Otros
- Dominio propio para CURVA (cuando lo decidan) → habilita `app.curva.vc` + Google login real.
- Definir costo/hora por persona (con Balmo) → habilita la vista de **rentabilidad**.
- Limpieza pendiente (de la landing): borrar repo viejo `andresnazca/curva` y el proyecto
  Vercel viejo (sin dominio, seguro borrar) — confirmar si ya se hizo.

---

## 9. Gotchas / notas técnicas
- **Next 16** trae cambios: leer `node_modules/next/dist/docs/` antes de tocar (lo pide AGENTS.md).
- `output: "export"` exige que `/manifest` tenga `export const dynamic = "force-static"` y que el
  redirect de `/` sea client-side (ya está así).
- **App en foco:** `lsappinfo` da el nombre de app sin permiso; el **título de ventana** (para ver
  el sitio dentro del navegador) usa System Events → requiere **Accesibilidad**.
- El umbral de inactividad (`DEFAULT_IDLE_SECONDS=60`) y el recordatorio (`3600s`) se pueden bajar
  para demo con `localStorage["curva.idleSeconds"]` / `["curva.reminderSeconds"]`.
- Recordatorio de consultoría: la detección dentro del navegador es un *plus* informativo y
  transparente, **no** punitivo — alineado a la cultura "medición, no vigilancia".
