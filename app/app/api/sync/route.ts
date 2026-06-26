import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { pullNotionToPostgres } from "@/lib/sync/notion-pull";

export const dynamic = "force-dynamic";

// Dispara un pull Notion → Postgres para la org del usuario. ADITIVO y seguro: solo
// llena el espejo; no toca el flujo actual (Notion sigue primario hasta el cutover por flag).
// Requiere el esquema 0011 aplicado + una org sembrada; si no, responde con un motivo claro.
export async function POST() {
  const sb = await getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, reason: "supabase-no-configurado" }, { status: 400 });

  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ ok: false, reason: "sin-sesion" }, { status: 401 });

  // Resuelve la org del usuario (cuando exista la tabla + membresía).
  let orgId: string | null = null;
  try {
    const { data: m } = await sb.from("org_members").select("org_id").eq("user_id", u.user.id).limit(1).maybeSingle();
    orgId = (m?.org_id as string) ?? null;
  } catch { /* esquema 0011 aún no aplicado */ }
  if (!orgId) return NextResponse.json({ ok: false, reason: "sin-org (aplica 0011 + siembra la org del piloto)" });

  const res = await pullNotionToPostgres(orgId);
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
