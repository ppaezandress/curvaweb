// Observabilidad del servidor. Nace de un problema real: hasta ahora los errores de las
// rutas API se tragaban en `catch {}` mudos y nos enterábamos días después, por screenshot
// de alguien del equipo. Aquí todo error queda (a) en el log estructurado de Vercel y
// (b) en la tabla `app_errors` de Supabase, que sí persiste y se puede consultar.
//
// Reglas de esta capa:
//  - NUNCA rompe la request: si el sink falla, se traga el fallo y sigue.
//  - NUNCA guarda secretos: `sanitize` redacta cualquier clave que huela a credencial.
//  - Es agnóstica del proveedor: si algún día entra Sentry (u otro), se engancha en
//    `emit` sin tocar los ~25 call sites.
import { getAdminSupabase } from "@/lib/supabase/server";

export type LogLevel = "error" | "warn" | "info";
export type Meta = Record<string, unknown>;

// Claves cuyo VALOR jamás debe salir en un log (tokens de Notion/Spotify/GCal, cookies…).
const SENSITIVE_KEY = /token|secret|key|password|passwd|authorization|cookie|dsn|credential/i;
const REDACTED = "[redactado]";
const MAX_STRING = 500;
// 3 niveles: la forma común de un contexto útil es `{ request: { headers: { … } } }`. Con 2
// se truncaba justo antes de llegar a las claves sensibles (no había fuga, pero tampoco
// contexto). La redacción se aplica por CLAVE antes de recursar, así que nada secreto
// escapa por debajo del corte.
const MAX_DEPTH = 3;
const MAX_STACK = 4000;
const SINK_TIMEOUT_MS = 1500;

// La versión desplegada, para saber si un error ya se arregló o sigue vivo.
const RELEASE = (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);

function truncate(s: string, max = MAX_STRING) {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// Aplana meta a algo seguro de guardar: redacta credenciales, recorta strings largos y
// corta la profundidad (un objeto de Notion entero no aporta y sí llena la tabla).
export function sanitize(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return { name: value.name, message: truncate(value.message) };
  if (depth >= MAX_DEPTH) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  try {
    return truncate(JSON.stringify(err));
  } catch {
    return String(err);
  }
}

function stackOf(err: unknown): string | undefined {
  return err instanceof Error && err.stack ? truncate(err.stack, MAX_STACK) : undefined;
}

// Agrupador estable: mismo scope + mismo mensaje sin sus partes variables (ids, números,
// uuids) = misma firma. Sirve para contar "cuántas veces pasó esto" en vez de ver 400 filas.
export function fingerprint(scope: string, message: string): string {
  const normalized = message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/g, "<id>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
  return `${scope}:${truncate(normalized, 120)}`;
}

type Event = {
  level: LogLevel;
  scope: string;
  message: string;
  fingerprint: string;
  stack?: string;
  meta?: Meta;
  userId?: string;
};

// Sink 1 — log estructurado a stdout. Queda en los logs de Vercel y es grepeable/parseable
// (una línea = un JSON). Siempre corre, aunque Supabase no esté configurado.
function logToConsole(e: Event) {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level: e.level,
    scope: e.scope,
    msg: e.message,
    fp: e.fingerprint,
    release: RELEASE,
    ...(e.userId ? { userId: e.userId } : {}),
    ...(e.meta ? { meta: e.meta } : {}),
    ...(e.stack ? { stack: e.stack } : {}),
  });
  if (e.level === "error") console.error(line);
  else if (e.level === "warn") console.warn(line);
  else console.info(line);
}

// Sink 2 — tabla `app_errors` (migración 0029). Persistente y consultable. Usa el cliente
// admin porque el error puede ocurrir SIN sesión (ahí está la gracia). Degrada limpio si la
// migración aún no está aplicada o si falta la service role key.
async function logToSupabase(e: Event) {
  const sb = getAdminSupabase();
  if (!sb) return;
  const insert = sb.from("app_errors").insert({
    level: e.level,
    scope: e.scope,
    message: e.message,
    fingerprint: e.fingerprint,
    stack: e.stack ?? null,
    meta: e.meta ?? null,
    user_id: e.userId ?? null,
    release: RELEASE,
  });
  // Un sink lento jamás debe colgar la request del usuario.
  await Promise.race([
    insert,
    new Promise((resolve) => setTimeout(resolve, SINK_TIMEOUT_MS)),
  ]);
}

async function emit(e: Event): Promise<void> {
  logToConsole(e);
  try {
    await logToSupabase(e);
  } catch {
    // El sink persistente nunca puede tumbar la request ni enmascarar el error original.
  }
}

/** Registra un error del servidor. Nunca lanza. `scope` = ruta o módulo ("api/time-entries POST"). */
export async function logError(scope: string, err: unknown, meta?: Meta & { userId?: string }): Promise<void> {
  const { userId, ...rest } = meta || {};
  const message = messageOf(err);
  await emit({
    level: "error",
    scope,
    message,
    fingerprint: fingerprint(scope, message),
    stack: stackOf(err),
    meta: Object.keys(rest).length ? (sanitize(rest) as Meta) : undefined,
    userId: typeof userId === "string" ? userId : undefined,
  });
}

/** Algo salió mal pero se pudo continuar (p. ej. una propiedad opcional de Notion que no existe). */
export async function logWarn(scope: string, message: string, meta?: Meta & { userId?: string }): Promise<void> {
  const { userId, ...rest } = meta || {};
  await emit({
    level: "warn",
    scope,
    message,
    fingerprint: fingerprint(scope, message),
    meta: Object.keys(rest).length ? (sanitize(rest) as Meta) : undefined,
    userId: typeof userId === "string" ? userId : undefined,
  });
}
