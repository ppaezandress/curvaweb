import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshAccess, gcalConfigured, listEvents } from "@/lib/gcal";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";

// Agenda de la semana del propio usuario: de HOY 00:00 a +7 días. Alimenta la vista
// "Mi semana" (/agenda) — cada persona ve SU calendario, con su propia sesión de Google.
export async function GET() {
  if (!gcalConfigured()) return NextResponse.json({ connected: false, events: [] });
  const jar = await cookies();
  const refresh = jar.get("gc_refresh")?.value;
  if (!refresh) return NextResponse.json({ connected: false, events: [] });

  try {
    const ref = await refreshAccess(refresh);
    if (!ref.access_token) return NextResponse.json({ connected: false, events: [] });
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    const events = await listEvents(ref.access_token, start, end, 100);
    return NextResponse.json({ connected: true, events });
  } catch (e) {
    logError("gcal.week", e);
    return NextResponse.json({ connected: false, events: [] });
  }
}
