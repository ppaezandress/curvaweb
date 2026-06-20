// Helpers server-side para Spotify. Secretos solo del lado servidor.

const ID = (process.env.SPOTIFY_CLIENT_ID || "").trim();
const SECRET = (process.env.SPOTIFY_CLIENT_SECRET || "").trim();
export const SPOTIFY_REDIRECT =
  (process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:3000/api/spotify/callback").trim();

export const SPOTIFY_SCOPES = "user-read-currently-playing user-read-playback-state";

export function spotifyConfigured() {
  return !!ID && !!SECRET;
}

export function authorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT,
    scope: SPOTIFY_SCOPES,
    state,
  });
  return `https://accounts.spotify.com/authorize?${p.toString()}`;
}

const basic = () => Buffer.from(`${ID}:${SECRET}`).toString("base64");

export async function exchangeCode(code: string) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: SPOTIFY_REDIRECT }),
  });
  return res.json() as Promise<{ access_token?: string; refresh_token?: string; expires_in?: number }>;
}

export async function refreshAccess(refreshToken: string) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  return res.json() as Promise<{ access_token?: string; expires_in?: number }>;
}
