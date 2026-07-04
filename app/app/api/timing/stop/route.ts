import { NextResponse } from "next/server";
import { timing, projectFromCwd } from "@/lib/timing-store";
import { logAITime } from "@/lib/notion/time";
import { broadcastAI } from "@/lib/realtime";
import { PILOT } from "@/lib/pilot-flags";

export const dynamic = "force-dynamic";

// Hook Stop de Claude Code: cierra el turno y registra el tiempo de IA.
export async function POST(req: Request) {
  if (!PILOT.aiTime) return NextResponse.json({ ok: false, error: "disabled" }, { status: 403 });
  const email = (req.headers.get("x-curva-user") || "").trim();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const sid = String((body as { session_id?: string }).session_id || "");
  if (email) timing.lastSignal.set(email.toLowerCase(), Date.now());

  const s = sid ? timing.open.get(sid) : undefined;
  if (!s) return NextResponse.json({ ok: true, skipped: "no-open-session" });
  timing.open.delete(sid);
  // Push en vivo: la IA terminó (independiente de si el turno se registra).
  void broadcastAI({ email: s.email || email, event: "stop" });

  const endedAt = Date.now();
  const secs = Math.round((endedAt - s.startedAt) / 1000);
  // Ignora turnos triviales (chat rápido); Claude Code de verdad dura más.
  if (secs < 20) return NextResponse.json({ ok: true, skipped: "too-short", secs });

  const id = await logAITime({
    email: s.email || email,
    startedAt: s.startedAt,
    endedAt,
    projectName: projectFromCwd(s.cwd),
  });
  return NextResponse.json({ ok: true, secs, logged: !!id });
}
