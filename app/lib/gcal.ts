// Helpers server-side para Google Calendar. Scope mínimo: solo "freebusy"
// (ocupado/libre) — NUNCA lee títulos ni detalles de los eventos. Privado.

const ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
export const GCAL_REDIRECT =
  (process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:3000/api/gcal/callback").trim();

// Solo disponibilidad (ocupado/libre), sin leer contenido de eventos.
export const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

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
