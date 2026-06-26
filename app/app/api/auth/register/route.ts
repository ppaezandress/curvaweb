import { NextResponse } from "next/server";
import { getAdminSupabase, supabaseConfigured } from "@/lib/supabase/server";
import { getCurvaData } from "@/lib/notion/fetchers";

export const dynamic = "force-dynamic";

const TEAM_CODE = (process.env.NEXT_PUBLIC_TEAM_CODE || "CURVA").toUpperCase();

// Alta de cuenta del piloto. La AUTORIZACIÓN vive aquí, en el servidor (no en el cliente):
//  1) código de equipo correcto, 2) el correo DEBE estar en el roster de Notion,
//  3) el notion_user_id se DERIVA del roster (nunca se confía en el cliente).
// Así nadie crea cuentas basura ni se mapea a la identidad de otro.
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase no configurado" }, { status: 400 });
  }
  const admin = getAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: "Sin admin" }, { status: 400 });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const teamCode = String(body.teamCode || "").trim().toUpperCase();

    if (!email || password.length < 6) {
      return NextResponse.json({ ok: false, error: "Correo y contraseña (6+) requeridos" }, { status: 400 });
    }
    // 1) Código de equipo — validado en el SERVIDOR
    if (teamCode !== TEAM_CODE) {
      return NextResponse.json({ ok: false, error: "Código de equipo incorrecto" }, { status: 403 });
    }
    // 2) El correo debe estar dado de alta en el equipo (roster de Notion)
    let member: { id: string; name: string } | undefined;
    try {
      const data = await getCurvaData();
      member = data.members.find((m) => m.email && m.email.toLowerCase() === email);
    } catch {
      return NextResponse.json({ ok: false, error: "No pudimos validar tu equipo ahora mismo. Reintenta." }, { status: 503 });
    }
    if (!member) {
      return NextResponse.json({ ok: false, error: "Tu correo no está dado de alta en el equipo (debe ser el de Notion)." }, { status: 403 });
    }

    // 3) Crear o encontrar la cuenta
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name: member.name },
    });
    let userId = data?.user?.id;
    if (error) {
      if (/already|exists|registered/i.test(error.message)) {
        const { data: list } = await admin.auth.admin.listUsers();
        userId = list?.users?.find((u) => (u.email || "").toLowerCase() === email)?.id;
        if (!userId) return NextResponse.json({ ok: true, exists: true });
      } else {
        return NextResponse.json({ ok: false, error: "No se pudo crear la cuenta" }, { status: 400 });
      }
    }

    // 4) Mapear el perfil con el notion_user_id DERIVADO del roster (no del cliente)
    if (userId) {
      const { error: upErr } = await admin.from("profiles").upsert({
        id: userId, name: member.name, notion_user_id: member.id, email,
      });
      if (upErr) {
        return NextResponse.json({ ok: false, error: "Esa persona ya tiene una cuenta. Contacta a tu admin." }, { status: 409 });
      }
    }
    return NextResponse.json({ ok: true, notionUserId: member.id, name: member.name });
  } catch {
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
