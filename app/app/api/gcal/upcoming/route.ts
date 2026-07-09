import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshAccess, gcalConfigured, listEvents } from "@/lib/gcal";

export const dynamic = "force-dynamic";

// Próximas juntas del usuario (ahora → +12h) para los recordatorios en la app.
export async function GET() {
  if (!gcalConfigured()) return NextResponse.json({ connected: false, events: [] });
  const jar = await cookies();
  const refresh = jar.get("gc_refresh")?.value;
  if (!refresh) return NextResponse.json({ connected: false, events: [] });
  try {
    const ref = await refreshAccess(refresh);
    if (!ref.access_token) return NextResponse.json({ connected: false, events: [] });
    const now = Date.now();
    const events = await listEvents(ref.access_token, new Date(now), new Date(now + 12 * 3600_000));
    return NextResponse.json({ connected: true, events });
  } catch {
    return NextResponse.json({ connected: false, events: [] });
  }
}
