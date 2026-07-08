import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authorizeUrl, redirectFor, spotifyConfigured } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!spotifyConfigured()) {
    return NextResponse.json({ ok: false, error: "Spotify no configurado" }, { status: 400 });
  }
  // state aleatorio anti-CSRF: se guarda en cookie (store, confiable en Next 16) y se valida en el callback.
  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set("sp_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  // Redirect al MISMO dominio desde donde se entra (kappa, tiempos-curva o local).
  const redirect = redirectFor(new URL(req.url).origin);
  return NextResponse.redirect(authorizeUrl(state, redirect));
}
