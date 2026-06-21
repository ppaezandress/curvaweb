import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// Desconecta Google Calendar: borra el refresh token guardado.
export async function GET(req: Request) {
  const jar = await cookies();
  jar.delete("gc_refresh");
  return NextResponse.redirect(new URL("/dashboard?gcal=off", req.url));
}
