import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshAccess, gcalConfigured, listEvents } from "@/lib/gcal";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const MAX_SPAN = 62 * DAY; // tope de seguridad (la rejilla del mes cabe de sobra)

// Eventos del propio usuario en un rango [from, to] (ms). Alimenta la vista de calendario
// (el mes visible). Cada request usa la sesión de Google de la persona (gc_refresh).
export async function GET(req: Request) {
  if (!gcalConfigured()) return NextResponse.json({ connected: false, events: [] });
  const jar = await cookies();
  const refresh = jar.get("gc_refresh")?.value;
  if (!refresh) return NextResponse.json({ connected: false, events: [] });

  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from"));
  let to = Number(url.searchParams.get("to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return NextResponse.json({ connected: true, events: [] });
  }
  if (to - from > MAX_SPAN) to = from + MAX_SPAN;

  try {
    const ref = await refreshAccess(refresh);
    if (!ref.access_token) return NextResponse.json({ connected: false, events: [] });
    const events = await listEvents(ref.access_token, new Date(from), new Date(to), 250);
    return NextResponse.json({ connected: true, events });
  } catch (e) {
    logError("gcal.range", e);
    return NextResponse.json({ connected: false, events: [] });
  }
}
