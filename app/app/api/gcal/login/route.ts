import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authorizeUrl, gcalConfigured } from "@/lib/gcal";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!gcalConfigured()) {
    return NextResponse.json({ ok: false, error: "Google Calendar no configurado" }, { status: 400 });
  }
  // state aleatorio anti-CSRF: se guarda en cookie (store, confiable en Next 16) y se valida en el callback.
  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set("gc_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(state));
}
