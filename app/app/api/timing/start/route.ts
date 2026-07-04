import { NextResponse } from "next/server";
import { timing, projectFromCwd } from "@/lib/timing-store";
import { broadcastAI } from "@/lib/realtime";
import { PILOT } from "@/lib/pilot-flags";

export const dynamic = "force-dynamic";

// Hook UserPromptSubmit de Claude Code: marca el inicio de un turno de IA.
// Body = JSON del hook (session_id, cwd, ...). Token de usuario en header x-curva-user.
export async function POST(req: Request) {
  // "Tiempo con IA" está apagado en el piloto. La identidad de estos hooks es un header sin
  // verificar (x-curva-user) → spoofable; se cierran hasta rediseñar la auth por token.
  if (!PILOT.aiTime) return NextResponse.json({ ok: false, error: "disabled" }, { status: 403 });
  const email = (req.headers.get("x-curva-user") || "").trim();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const sid = String((body as { session_id?: string }).session_id || "");
  if (!sid) return NextResponse.json({ ok: false, error: "no session_id" });
  const startedAt = Date.now();
  const cwd = String((body as { cwd?: string }).cwd || "");
  timing.open.set(sid, { email, cwd, startedAt });
  if (email) {
    timing.lastSignal.set(email.toLowerCase(), startedAt);
    // Push en vivo: la IA empezó a trabajar.
    void broadcastAI({ email, event: "start", project: projectFromCwd(cwd), startedAt });
  }
  return NextResponse.json({ ok: true });
}
