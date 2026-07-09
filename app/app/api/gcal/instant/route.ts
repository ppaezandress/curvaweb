import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshAccess, createEvent, gcalConfigured } from "@/lib/gcal";

export const dynamic = "force-dynamic";

// "Reunirse ahora": crea un Meet al instante (evento corto, sin mandar correos) y
// devuelve el enlace para compartirlo en el canal. Estilo Huddle de Slack.
export async function POST(req: Request) {
  if (!gcalConfigured()) return NextResponse.json({ ok: false, error: "Google Calendar no configurado" }, { status: 400 });
  const jar = await cookies();
  const refresh = jar.get("gc_refresh")?.value;
  if (!refresh) return NextResponse.json({ ok: false, error: "no-gcal" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ref = await refreshAccess(refresh);
  if (!ref.access_token) return NextResponse.json({ ok: false, error: "no-gcal" }, { status: 401 });

  const now = Date.now();
  const res = await createEvent(ref.access_token, {
    title: body?.title ? String(body.title) : "Llamada rápida",
    startISO: new Date(now).toISOString(),
    endISO: new Date(now + 30 * 60_000).toISOString(),
    attendees: [],
    description: "Llamada iniciada desde team tac",
    withMeet: true,
    notify: false,
  });
  if (!res.ok) {
    if (res.status === 403) return NextResponse.json({ ok: false, error: "reconnect" }, { status: 403 });
    return NextResponse.json({ ok: false, error: "No se pudo iniciar la llamada" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, link: res.event?.hangoutLink || res.event?.htmlLink || null });
}
