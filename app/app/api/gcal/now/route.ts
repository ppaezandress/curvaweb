import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshAccess, gcalConfigured, listEvents } from "@/lib/gcal";

export const dynamic = "force-dynamic";

// ¿La persona está en junta AHORA? (para la presencia del equipo: solo ocupado/libre)
export async function GET() {
  if (!gcalConfigured()) return NextResponse.json({ connected: false });
  const jar = await cookies();
  const refresh = jar.get("gc_refresh")?.value;
  if (!refresh) return NextResponse.json({ connected: false });

  try {
    const ref = await refreshAccess(refresh);
    if (!ref.access_token) return NextResponse.json({ connected: false });
    const now = Date.now();
    const events = await listEvents(ref.access_token, new Date(now - 60_000), new Date(now + 60_000));
    const busy = events.some((e) => e.start <= now && now < e.end);
    return NextResponse.json({ connected: true, busy });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
