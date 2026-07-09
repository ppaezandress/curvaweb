import { NextResponse } from "next/server";
import { getAdminSupabase, supabaseConfigured } from "@/lib/supabase/server";
import { getCurvaData } from "@/lib/notion/fetchers";
import { rateLimit, clientIp, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const TEAM_CODE = (process.env.NEXT_PUBLIC_TEAM_CODE || "CURVA").toUpperCase();
const MIN_PASSWORD = 8;
// Admins (ven la data de todos + dashboard del equipo). El resto solo su propia data.
// Configurable por env (ADMIN_EMAILS="a@x.com,b@y.com") para cambiar admins sin redeploy;
// fallback a la lista del piloto si la env no está seteada.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "ppaezandress@gmail.com,osbalmar2004@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

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

  // Anti-abuso: el alta crea usuarios en Supabase Auth y pega a Notion en cada intento.
  // Límite estricto por IP (frena enumeración del roster y brute-force masivo).
  const rl = await rateLimit(`register:${clientIp(req)}`, { limit: 8, windowSec: 300 });
  if (!rl.ok) return tooMany(rl.retryAfter);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const teamCode = String(body.teamCode || "").trim().toUpperCase();

    if (!email || password.length < MIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: `Correo y contraseña (${MIN_PASSWORD}+) requeridos` }, { status: 400 });
    }
    // Segunda cubeta por correo: acota intentos contra una misma cuenta aunque roten IP.
    const rlEmail = await rateLimit(`register-email:${email}`, { limit: 5, windowSec: 900 });
    if (!rlEmail.ok) return tooMany(rlEmail.retryAfter);
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
        is_admin: ADMIN_EMAILS.includes(email),
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
