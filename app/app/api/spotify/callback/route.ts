import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/dashboard?spotify=error", req.url));

  const tok = await exchangeCode(code);
  const res = NextResponse.redirect(new URL("/dashboard?spotify=ok", req.url));
  if (tok.refresh_token) {
    // refresh token en cookie httpOnly (no accesible desde JS del cliente).
    res.cookies.set("sp_refresh", tok.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  return res;
}
