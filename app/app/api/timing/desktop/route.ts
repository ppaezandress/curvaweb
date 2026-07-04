import { NextResponse } from "next/server";
import { timing, projectFromCwd } from "@/lib/timing-store";
import { logAITime } from "@/lib/notion/time";
import { PILOT } from "@/lib/pilot-flags";

export const dynamic = "force-dynamic";

// Conector de Claude Desktop (modo agente). El watcher reporta sesiones COMPLETAS
// (con su inicio y fin), a diferencia de Claude Code que usa start/stop por turno.
// Body: { email, cwd, startedAt, endedAt, sessionId }. Solo metadatos, nunca contenido.
export async function POST(req: Request) {
  if (!PILOT.aiTime) return NextResponse.json({ ok: false, error: "disabled" }, { status: 403 });
  const headerEmail = (req.headers.get("x-curva-user") || "").trim();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const b = body as { email?: string; cwd?: string; startedAt?: number; endedAt?: number; sessionId?: string };

  const email = (b.email || headerEmail || "").trim();
  const startedAt = Number(b.startedAt) || 0;
  const endedAt = Number(b.endedAt) || 0;
  const sessionId = String(b.sessionId || "");

  if (email) timing.lastSignal.set(email.toLowerCase(), Date.now());

  // Validación básica.
  if (!startedAt || !endedAt || endedAt <= startedAt) {
    return NextResponse.json({ ok: false, error: "rango inválido" }, { status: 400 });
  }
  const secs = Math.round((endedAt - startedAt) / 1000);
  if (secs < 20) return NextResponse.json({ ok: true, skipped: "too-short", secs });

  // Dedup: misma sesión + mismo fin no se registra dos veces.
  const key = `${sessionId}:${endedAt}`;
  if (sessionId && timing.loggedDesktop.has(key)) {
    return NextResponse.json({ ok: true, skipped: "duplicate" });
  }

  const id = await logAITime({ email, startedAt, endedAt, projectName: projectFromCwd(b.cwd) });
  if (id && sessionId) {
    timing.loggedDesktop.add(key);
    // Acota el set para no crecer sin límite en memoria.
    if (timing.loggedDesktop.size > 2000) {
      timing.loggedDesktop.clear();
    }
  }
  return NextResponse.json({ ok: true, secs, logged: !!id });
}
