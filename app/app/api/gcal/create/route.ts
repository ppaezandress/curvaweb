import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshAccess, createEvent, gcalConfigured } from "@/lib/gcal";

export const dynamic = "force-dynamic";

// Crea un evento en el Google Calendar del usuario conectado, con invitados + Meet.
// Requiere la cookie gc_refresh (que solo tiene quien conectó su propia cuenta).
export async function POST(req: Request) {
  if (!gcalConfigured()) return NextResponse.json({ ok: false, error: "Google Calendar no configurado" }, { status: 400 });
  const jar = await cookies();
  const refresh = jar.get("gc_refresh")?.value;
  if (!refresh) return NextResponse.json({ ok: false, error: "no-gcal" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.startISO || !body?.endISO) {
    return NextResponse.json({ ok: false, error: "Faltan datos del evento" }, { status: 400 });
  }

  const ref = await refreshAccess(refresh);
  if (!ref.access_token) return NextResponse.json({ ok: false, error: "no-gcal" }, { status: 401 });

  const ev = await createEvent(ref.access_token, {
    title: String(body.title),
    startISO: String(body.startISO),
    endISO: String(body.endISO),
    attendees: Array.isArray(body.attendees) ? body.attendees.map(String) : [],
    description: body.description ? String(body.description) : undefined,
    withMeet: !!body.withMeet,
  });
  if (!ev) return NextResponse.json({ ok: false, error: "No se pudo crear el evento" }, { status: 500 });
  return NextResponse.json({ ok: true, event: ev });
}
