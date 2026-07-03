// Persistencia de leads del chat en Supabase vía REST (sin SDK).
// Tablas esperadas (crear en Supabase):
//
//   create table curva_leads (
//     email text primary key,
//     source text,
//     first_seen timestamptz default now()
//   );
//   create table curva_chat_messages (
//     id bigint generated always as identity primary key,
//     email text references curva_leads(email),
//     role text,
//     content text,
//     created_at timestamptz default now()
//   );
//
// Si faltan las env, todo es no-op (avisa por consola) para no romper build/dev.
import { env } from './env';

function cfg() {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return { url, key };
}

export function leadsConfigured(): boolean {
  const { url, key } = cfg();
  return Boolean(url && key);
}

async function post(table: string, rows: unknown, prefer?: string): Promise<boolean> {
  const { url, key } = cfg();
  if (!url || !key) {
    console.warn(`[leads] Supabase no configurado — se omite guardar en ${table}`);
    return false;
  }
  try {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: prefer || 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      console.warn(`[leads] ${table} → ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[leads] error de red:', (e as Error).message);
    return false;
  }
}

export async function upsertLead(email: string, source = 'chat'): Promise<boolean> {
  return post('curva_leads', { email, source }, 'resolution=merge-duplicates,return=minimal');
}

export async function saveMessage(email: string, role: 'user' | 'assistant', content: string): Promise<boolean> {
  return post('curva_chat_messages', { email, role, content });
}
