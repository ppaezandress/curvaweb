import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshAccess, gcalConfigured, listEvents } from "@/lib/gcal";

export const dynamic = "force-dynamic";

// Eventos de HOY (00:00–23:59) del propio usuario — para la mentalización del día.
export async function GET() {
  if (!gcalConfigured()) return NextResponse.json({ connected: false, events: [] });
  const jar = await cookies();
  const refresh = jar.get("gc_refresh")?.value;
  if (!refresh) return NextResponse.json({ connected: false, events: [] });

  try {
    const ref = await refreshAccess(refresh);
    if (!ref.access_token) return NextResponse.json({ connected: false, events: [] });
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const events = await listEvents(ref.access_token, start, end);
    return NextResponse.json({ connected: true, events });
  } catch {
    return NextResponse.json({ connected: false, events: [] });
  }
}
