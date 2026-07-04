import { NextResponse } from "next/server";
import { timing } from "@/lib/timing-store";
import { PILOT } from "@/lib/pilot-flags";

export const dynamic = "force-dynamic";

// Estado del conector (para el panel "Conectar Claude Code").
export async function GET(req: Request) {
  if (!PILOT.aiTime) return NextResponse.json({ lastSignal: null, openSessions: 0 });
  const url = new URL(req.url);
  const email = (req.headers.get("x-curva-user") || url.searchParams.get("u") || "").trim().toLowerCase();
  const last = email ? timing.lastSignal.get(email) || null : null;
  return NextResponse.json({ lastSignal: last, openSessions: timing.open.size });
}
