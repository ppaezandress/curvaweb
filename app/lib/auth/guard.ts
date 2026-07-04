import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";

// Cliente de Supabase ligado a la sesión (el mismo tipo que devuelve getServerSupabase).
type SB = NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>;

export type Persona = { name: string; notion_user_id: string | null; is_admin: boolean };

type SessionOk = { ok: true; sb: SB; user: User };
type SessionErr = { ok: false; response: NextResponse };

// Guard de sesión reutilizable para route handlers. Replica el patrón de /api/sync:
//   const auth = await requireSession();
//   if (!auth.ok) return auth.response;
// Cierra el acceso anónimo a las rutas que leen/escriben el Notion de producción.
export async function requireSession(): Promise<SessionOk | SessionErr> {
  const sb = await getServerSupabase();
  if (!sb) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "sin-config" }, { status: 401 }) };
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "sin-sesion" }, { status: 401 }) };
  }
  return { ok: true, sb, user };
}

// Persona de Notion del usuario autenticado: el nombre para escribir A SU nombre (no el del
// body, que es spoofable) e is_admin para los muros de visibilidad. Devuelve null si el perfil
// aún no está sembrado (se siembra en el registro).
export async function getPersona(sb: SB, userId: string): Promise<Persona | null> {
  const { data } = await sb
    .from("profiles")
    .select("name, notion_user_id, is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: ((data.name as string) || "").trim(),
    notion_user_id: (data.notion_user_id as string) ?? null,
    is_admin: !!data.is_admin,
  };
}
