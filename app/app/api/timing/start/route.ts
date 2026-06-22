import { NextResponse } from "next/server";
import { timing } from "@/lib/timing-store";

export const dynamic = "force-dynamic";

// Hook UserPromptSubmit de Claude Code: marca el inicio de un turno de IA.
// Body = JSON del hook (session_id, cwd, ...). Token de usuario en header x-curva-user.
export async function POST(req: Request) {
  const email = (req.headers.get("x-curva-user") || "").trim();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const sid = String((body as { session_id?: string }).session_id || "");
  if (!sid) return NextResponse.json({ ok: false, error: "no session_id" });
  timing.open.set(sid, { email, cwd: String((body as { cwd?: string }).cwd || ""), startedAt: Date.now() });
  if (email) timing.lastSignal.set(email.toLowerCase(), Date.now());
  return NextResponse.json({ ok: true });
}
