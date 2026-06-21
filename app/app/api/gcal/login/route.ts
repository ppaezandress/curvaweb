import { NextResponse } from "next/server";
import { authorizeUrl, gcalConfigured } from "@/lib/gcal";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!gcalConfigured()) {
    return NextResponse.json({ ok: false, error: "Google Calendar no configurado" }, { status: 400 });
  }
  return NextResponse.redirect(authorizeUrl("curva"));
}
