// Helper server-side para registrar tiempo de IA (Claude Code) en Notion.
import { notionFetch, notionConfigured } from "./client";
import { getCurvaData } from "./fetchers";

const DB = (process.env.NOTION_DB_TIME || "").trim();

// Cache ligero de email→nombre (evita 3 queries a Notion por cada turno).
let nameCache: { at: number; map: Record<string, string> } | null = null;
async function emailToName(email: string): Promise<string> {
  const e = (email || "").trim().toLowerCase();
  if (!e) return "";
  if (!nameCache || Date.now() - nameCache.at > 5 * 60_000) {
    try {
      const data = await getCurvaData();
      const map: Record<string, string> = {};
      data.members.forEach((m) => { if (m.email) map[m.email.toLowerCase()] = m.name; });
      nameCache = { at: Date.now(), map };
    } catch { nameCache = { at: Date.now(), map: {} }; }
  }
  return nameCache.map[e] || email;
}

// Registra una sesión de IA como fila en "Registro de Tiempo" (Modo = IA).
export async function logAITime(opts: {
  email: string;
  startedAt: number;
  endedAt: number;
  projectName?: string;
}): Promise<string | null> {
  if (!notionConfigured() || !DB) return null;
  const userName = await emailToName(opts.email);
  const minutes = Math.round(((opts.endedAt - opts.startedAt) / 60000) * 10) / 10;
  if (minutes <= 0) return null;
  const title = `${userName || "—"} · IA · ${opts.projectName || "Claude Code"}`.slice(0, 80);
  const properties: Record<string, unknown> = {
    Nombre: { title: [{ text: { content: title } }] },
    Persona: { rich_text: [{ text: { content: userName || "" } }] },
    Inicio: { date: { start: new Date(opts.startedAt).toISOString() } },
    Fin: { date: { start: new Date(opts.endedAt).toISOString() } },
    Minutos: { number: minutes },
    Modo: { select: { name: "IA" } },
  };
  try {
    const page = await notionFetch<{ id: string }>("/pages", {
      method: "POST",
      body: JSON.stringify({ parent: { database_id: DB }, properties }),
    });
    return page.id;
  } catch {
    return null;
  }
}
