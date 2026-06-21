import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/dashboard?spotify=error", req.url));

  const tok = await exchangeCode(code);
  if (tok.refresh_token) {
    // Set vía el store de cookies (más confiable en Next 16 que en el redirect).
    const jar = await cookies();
    jar.set("sp_refresh", tok.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // http loopback (127.0.0.1)
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  return NextResponse.redirect(
    new URL(tok.refresh_token ? "/dashboard?spotify=ok" : "/dashboard?spotify=notoken", req.url),
  );
}
