import { NextResponse } from "next/server";
import { getAdminSupabase, supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Alta de cuenta confirmada (sin email de verificación) + perfil mapeado al
// miembro de Notion. Idempotente: si el correo ya existe, solo asegura el perfil.
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase no configurado" }, { status: 400 });
  }
  const admin = getAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: "Sin admin" }, { status: 400 });

  try {
    const { email, password, name, notionUserId } = await req.json();
    if (!email || !password || password.length < 6) {
      return NextResponse.json({ ok: false, error: "Correo y contraseña (6+) requeridos" }, { status: 400 });
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    let userId = data?.user?.id;
    if (error) {
      // Probablemente ya existe → buscarlo para asegurar el perfil
      if (/already|exists|registered/i.test(error.message)) {
        const { data: list } = await admin.auth.admin.listUsers();
        userId = list?.users?.find((u) => u.email === email)?.id;
        if (!userId) return NextResponse.json({ ok: true, exists: true });
      } else {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }
    }

    if (userId) {
      await admin.from("profiles").upsert({
        id: userId,
        name: name || email.split("@")[0],
        notion_user_id: notionUserId || null,
        email,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
