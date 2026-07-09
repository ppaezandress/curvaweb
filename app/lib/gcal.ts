// Helpers server-side para Google Calendar.
// Lee SOLO los eventos del propio usuario (para sugerir proyecto y registrar el
// tiempo de juntas). El equipo nunca ve títulos: la presencia solo dice "En junta".

const ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
export const GCAL_REDIRECT =
  (process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:3000/api/gcal/callback").trim();

// Lectura + escritura de eventos: leer juntas (registro de tiempo) y CREAR eventos con
// invitados desde el chat. calendar.events cubre ambas. OJO: al ampliar el scope, cada
// usuario debe RECONECTAR Google Calendar para otorgar el permiso nuevo.
export const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";

// El redirect debe ser el mismo dominio donde arranca el flujo (si no, la cookie de
// state no viaja). Se deriva del host del request; GCAL_REDIRECT queda como fallback.
export function redirectFor(origin?: string) {
  return origin ? `${origin.replace(/\/$/, "")}/api/gcal/callback` : GCAL_REDIRECT;
}

export type GEvent = {
  id: string;
  title: string;
  start: number; // ms epoch
  end: number;   // ms epoch
  attendees: string[]; // correos
  hangoutLink?: string; // si es videollamada
};

// Lista eventos (singleEvents) en una ventana de tiempo.
export async function listEvents(accessToken: string, timeMin: Date, timeMax: Date): Promise<GEvent[]> {
  const p = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "25",
  });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!r.ok) return [];
  const data = await r.json();
  type RawEvent = {
    id: string; summary?: string; hangoutLink?: string;
    status?: string; transparency?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    attendees?: { email?: string; self?: boolean }[];
  };
  return ((data.items || []) as RawEvent[])
    .filter((e) => e.start?.dateTime && e.end?.dateTime && e.status !== "cancelled" && e.transparency !== "transparent")
    .map((e) => ({
      id: e.id,
      title: e.summary || "(sin título)",
      start: new Date(e.start!.dateTime!).getTime(),
      end: new Date(e.end!.dateTime!).getTime(),
      attendees: (e.attendees || []).map((a) => (a.email || "").toLowerCase()).filter(Boolean),
      hangoutLink: e.hangoutLink,
    }));
}

export function gcalConfigured() {
  return !!ID && !!SECRET;
}

export function authorizeUrl(state: string, redirect: string) {
  const p = new URLSearchParams({
    client_id: ID,
    redirect_uri: redirect,
    response_type: "code",
    scope: GCAL_SCOPE,
    access_type: "offline", // para recibir refresh_token
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function exchangeCode(code: string, redirect: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: ID, client_secret: SECRET, redirect_uri: redirect, grant_type: "authorization_code",
    }),
  });
  return res.json() as Promise<{ access_token?: string; refresh_token?: string; expires_in?: number }>;
}

// Crea un evento en el calendario primario con invitados; envía las invitaciones por
// correo (sendUpdates=all) y opcionalmente genera un Meet.
export async function createEvent(accessToken: string, ev: {
  title: string; startISO: string; endISO: string; attendees: string[]; description?: string; withMeet?: boolean;
}): Promise<{ ok: boolean; status: number; event?: { id?: string; htmlLink?: string; hangoutLink?: string } }> {
  const body: Record<string, unknown> = {
    summary: ev.title,
    start: { dateTime: ev.startISO },
    end: { dateTime: ev.endISO },
    attendees: ev.attendees.filter(Boolean).map((email) => ({ email })),
  };
  if (ev.description) body.description = ev.description;
  const p = new URLSearchParams({ sendUpdates: "all" });
  if (ev.withMeet) {
    body.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
    p.set("conferenceDataVersion", "1");
  }
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { ok: false, status: r.status }; // 403 = permiso viejo (solo lectura) → reconectar
  const d = await r.json() as { id?: string; htmlLink?: string; hangoutLink?: string };
  return { ok: true, status: 200, event: { id: d.id, htmlLink: d.htmlLink, hangoutLink: d.hangoutLink } };
}

export async function refreshAccess(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: ID, client_secret: SECRET, grant_type: "refresh_token",
    }),
  });
  return res.json() as Promise<{ access_token?: string; expires_in?: number }>;
}
