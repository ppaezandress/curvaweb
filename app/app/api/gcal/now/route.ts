import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshAccess, gcalConfigured } from "@/lib/gcal";

export const dynamic = "force-dynamic";

// ¿La persona está ocupada AHORA? Usa freeBusy (solo ocupado/libre, sin títulos).
export async function GET() {
  if (!gcalConfigured()) return NextResponse.json({ connected: false });
  const jar = await cookies();
  const refresh = jar.get("gc_refresh")?.value;
  if (!refresh) return NextResponse.json({ connected: false });

  try {
    const ref = await refreshAccess(refresh);
    const access_token = ref.access_token;
    if (!access_token) return NextResponse.json({ connected: false });

    const now = new Date();
    const min = new Date(now.getTime() - 60_000).toISOString();
    const max = new Date(now.getTime() + 60_000).toISOString();

    const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ timeMin: min, timeMax: max, items: [{ id: "primary" }] }),
    });
    if (!r.ok) return NextResponse.json({ connected: true, busy: false });
    const data = await r.json();
    const busyArr: { start: string; end: string }[] = data?.calendars?.primary?.busy || [];
    const t = now.getTime();
    const busy = busyArr.some((b) => new Date(b.start).getTime() <= t && t < new Date(b.end).getTime());
    return NextResponse.json({ connected: true, busy });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
