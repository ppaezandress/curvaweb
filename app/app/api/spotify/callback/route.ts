import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/dashboard?spotify=error", req.url));

  // Validar el state contra la cookie (anti-CSRF de vinculación de cuenta).
  const jar = await cookies();
  const expected = jar.get("sp_state")?.value;
  if (!expected || url.searchParams.get("state") !== expected) {
    return NextResponse.redirect(new URL("/dashboard?spotify=error", req.url));
  }
  jar.delete("sp_state");

  const tok = await exchangeCode(code);
  if (tok.refresh_token) {
    // Set vía el store de cookies (más confiable en Next 16 que en el redirect).
    jar.set("sp_refresh", tok.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production", // https en prod; loopback http en dev
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  return NextResponse.redirect(
    new URL(tok.refresh_token ? "/dashboard?spotify=ok" : "/dashboard?spotify=notoken", req.url),
  );
}
