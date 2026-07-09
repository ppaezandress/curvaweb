// Rate limiting best-effort para endpoints públicos (register, support, etc.).
//
// Preferimos Upstash Redis (fixed-window vía REST — sin SDK, sin dependencias nuevas)
// cuando `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` están configurados
// (ya declarados en el .env.example del proyecto). Si NO lo están, caemos a un
// contador en memoria: en serverless no es 100% fiable entre instancias, pero
// frena ráfagas dentro de un mismo runtime — mejor que nada y nunca rompe el request.
//
// Uso:
//   const rl = await rateLimit(`register:${ip}`, { limit: 5, windowSec: 60 });
//   if (!rl.ok) return tooMany(rl.retryAfter);

const UP_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const upstashOn = Boolean(UP_URL && UP_TOKEN);

export type RateResult = { ok: boolean; remaining: number; retryAfter: number };

// ── Fallback en memoria (fixed-window) ──
const mem = new Map<string, { count: number; resetAt: number }>();
function memLimit(key: string, limit: number, windowSec: number): RateResult {
  const now = Date.now();
  const rec = mem.get(key);
  if (!rec || rec.resetAt <= now) {
    mem.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  rec.count += 1;
  const retryAfter = Math.max(1, Math.ceil((rec.resetAt - now) / 1000));
  if (rec.count > limit) return { ok: false, remaining: 0, retryAfter };
  return { ok: true, remaining: limit - rec.count, retryAfter };
}

// Limpieza perezosa para que el Map no crezca sin límite en runtimes de larga vida.
function sweep() {
  if (mem.size < 5000) return;
  const now = Date.now();
  for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
}

// ── Upstash REST: INCR + (EXPIRE en el primer hit) vía pipeline ──
async function upstashLimit(key: string, limit: number, windowSec: number): Promise<RateResult> {
  const k = `rl:${key}`;
  const res = await fetch(`${UP_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", k],
      ["EXPIRE", k, String(windowSec), "NX"],
      ["PTTL", k],
    ]),
    // No bloquear el request si Upstash tarda: presupuesto corto.
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const out = (await res.json()) as Array<{ result: number }>;
  const count = Number(out[0]?.result ?? 0);
  const pttl = Number(out[2]?.result ?? windowSec * 1000);
  const retryAfter = Math.max(1, Math.ceil((pttl > 0 ? pttl : windowSec * 1000) / 1000));
  if (count > limit) return { ok: false, remaining: 0, retryAfter };
  return { ok: true, remaining: Math.max(0, limit - count), retryAfter };
}

export async function rateLimit(
  key: string,
  { limit, windowSec }: { limit: number; windowSec: number },
): Promise<RateResult> {
  sweep();
  if (upstashOn) {
    try {
      return await upstashLimit(key, limit, windowSec);
    } catch {
      // Fail-open hacia el fallback en memoria: nunca tumbamos el endpoint por Redis.
      return memLimit(key, limit, windowSec);
    }
  }
  return memLimit(key, limit, windowSec);
}

// IP del cliente detrás de Vercel/proxy. Cae a "unknown" (comparten cubeta, aceptable).
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

import { NextResponse } from "next/server";
export function tooMany(retryAfter: number) {
  return NextResponse.json(
    { ok: false, error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } },
  );
}
