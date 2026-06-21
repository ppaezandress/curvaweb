// Construye el enlace a una página (tarea) en Notion a partir de su ID.
// Notion acepta el ID sin guiones al final de la URL.
export function notionTaskUrl(taskId: string): string {
  const clean = (taskId || "").replace(/-/g, "");
  return `https://www.notion.so/${clean}`;
}

// --- Menciones embebidas en el cuerpo del mensaje ---
// Tokens: ⟦task:<id>|<nombre>⟧ (tarea, enlaza a Notion) y ⟦user:<id>|<nombre>⟧ (persona)
const TOKEN = /⟦(task|user):([^|]+)\|([^⟧]+)⟧/g;

export type MsgPart =
  | { type: "text"; text: string }
  | { type: "task"; id: string; name: string }
  | { type: "user"; id: string; name: string };

/** Parte un mensaje en texto, chips de tarea y menciones de personas. */
export function parseMessage(body: string): MsgPart[] {
  const parts: MsgPart[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ type: "text", text: body.slice(last, idx) });
    parts.push({ type: m[1] as "task" | "user", id: m[2], name: m[3] });
    last = idx + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
  return parts;
}

export function taskToken(id: string, name: string): string {
  return `⟦task:${id}|${name}⟧`;
}
export function userToken(id: string, name: string): string {
  return `⟦user:${id}|${name}⟧`;
}
