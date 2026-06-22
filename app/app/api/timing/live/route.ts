import { NextResponse } from "next/server";
import { timing, projectFromCwd } from "@/lib/timing-store";

export const dynamic = "force-dynamic";

// Sesiones de IA en curso AHORA (turno de Claude Code abierto) para mostrar reloj en vivo.
export async function GET(req: Request) {
  const email = (new URL(req.url).searchParams.get("u") || "").trim().toLowerCase();
  const active: { project: string; startedAt: number }[] = [];
  for (const [, s] of timing.open) {
    if (!email || (s.email || "").toLowerCase() === email) {
      active.push({ project: projectFromCwd(s.cwd), startedAt: s.startedAt });
    }
  }
  return NextResponse.json({ active });
}
