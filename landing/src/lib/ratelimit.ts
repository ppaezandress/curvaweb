// Rate-limit anti-abuso (protege el gasto del LLM). Usa Upstash Redis vía REST
// si está configurado; si no, cae a un limitador en memoria (por instancia
// serverless) — conservador pero suficiente como red de seguridad.
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
import { env } from './env';

function cfg() {
  return { url: env('UPSTASH_REDIS_REST_URL'), token: env('UPSTASH_REDIS_REST_TOKEN') };
}

// Fallback en memoria (se reinicia con cada cold start; no es global, pero frena ráfagas).
const mem = new Map<string, { count: number; reset: number }>();

async function upstash(key: string, windowSec: number): Promise<number | null> {
  const { url, token } = cfg();
  if (!url || !token) return null;
  try {
    // INCR key ; si es el primer hit, EXPIRE key windowSec.
    const incrRes = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const incr: any = await incrRes.json();
    const count = Number(incr?.result ?? 0);
    if (count === 1) {
      await fetch(`${url}/expire/${encodeURIComponent(key)}/${windowSec}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    return count;
  } catch {
    return null;
  }
}

// Devuelve { ok, remaining }. `max` peticiones por `windowSec` segundos.
export async function rateLimit(
  key: string,
  max = 20,
  windowSec = 3600
): Promise<{ ok: boolean; remaining: number }> {
  const count = await upstash(`curva:rl:${key}`, windowSec);
  if (count !== null) {
    return { ok: count <= max, remaining: Math.max(0, max - count) };
  }
  // Fallback en memoria
  const now = Date.now();
  const entry = mem.get(key);
  if (!entry || now > entry.reset) {
    mem.set(key, { count: 1, reset: now + windowSec * 1000 });
    return { ok: true, remaining: max - 1 };
  }
  entry.count++;
  return { ok: entry.count <= max, remaining: Math.max(0, max - entry.count) };
}
