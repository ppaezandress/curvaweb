// Helpers server-side para Google Calendar.
// Lee SOLO los eventos del propio usuario (para sugerir proyecto y registrar el
// tiempo de juntas). El equipo nunca ve títulos: la presencia solo dice "En junta".

const ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
export const GCAL_REDIRECT =
  (process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:3000/api/gcal/callback").trim();

// Lectura de eventos (incluye disponibilidad). Solo lectura.
export const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

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

export function authorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: ID,
    redirect_uri: GCAL_REDIRECT,
    response_type: "code",
    scope: GCAL_SCOPE,
    access_type: "offline", // para recibir refresh_token
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: ID, client_secret: SECRET, redirect_uri: GCAL_REDIRECT, grant_type: "authorization_code",
    }),
  });
  return res.json() as Promise<{ access_token?: string; refresh_token?: string; expires_in?: number }>;
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
