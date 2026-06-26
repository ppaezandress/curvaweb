import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ReportSchema = z.object({
  description: z.string().trim().min(3).max(4000),
  page: z.string().max(300).nullish(),
  screenshot: z.string().max(8_000_000).nullish(), // data URL base64 (cap ~8MB); nullish: acepta null/ausente
  userAgent: z.string().max(500).nullish(),
});

// Recibe un reporte de problema del piloto → tabla support_reports (privada).
export async function POST(req: Request) {
  const sb = await getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });

  const parsed = ReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const { description, page, screenshot, userAgent } = parsed.data;

  try {
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("support_reports").insert({
      user_id: user?.id ?? null, description, page: page ?? null,
      screenshot: screenshot ?? null, user_agent: userAgent ?? null,
    });
    if (error) {
      // Degrada con gracia si la tabla aún no existe (no romper el reporte).
      return NextResponse.json({ ok: false, reason: error.message.includes("support_reports") ? "tabla-no-aplicada" : error.message }, { status: 200 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: String(e) }, { status: 200 });
  }
}
