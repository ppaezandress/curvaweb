import { NextResponse } from "next/server";
import { authorizeUrl, spotifyConfigured } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!spotifyConfigured()) {
    return NextResponse.json({ ok: false, error: "Spotify no configurado" }, { status: 400 });
  }
  return NextResponse.redirect(authorizeUrl("curva"));
}
