import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseConfigured() {
  return !!URL && !!ANON;
}

// Cliente ligado a la sesión del usuario (cookies). Respeta RLS.
export async function getServerSupabase() {
  if (!URL || !ANON) return null;
  const jar = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          /* en server components puede fallar; ok */
        }
      },
    },
  });
}

// Cliente admin (service role) — solo para operaciones de servidor de confianza (Storage).
export function getAdminSupabase() {
  if (!URL || !SERVICE) return null;
  return createServerClient(URL, SERVICE, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
