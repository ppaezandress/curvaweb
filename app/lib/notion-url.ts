// Construye el enlace a una página (tarea) en Notion a partir de su ID.
// Notion acepta el ID sin guiones al final de la URL.
export function notionTaskUrl(taskId: string): string {
  const clean = (taskId || "").replace(/-/g, "");
  return `https://www.notion.so/${clean}`;
}

// --- Menciones de tareas embebidas en el cuerpo del mensaje ---
// Formato del token: ⟦task:<id>|<nombre>⟧
const TOKEN = /⟦task:([^|]+)\|([^⟧]+)⟧/g;

export type MsgPart =
  | { type: "text"; text: string }
  | { type: "task"; id: string; name: string };

/** Parte un mensaje en texto plano y chips de tarea. */
export function parseMessage(body: string): MsgPart[] {
  const parts: MsgPart[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ type: "text", text: body.slice(last, idx) });
    parts.push({ type: "task", id: m[1], name: m[2] });
    last = idx + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
  return parts;
}

export function taskToken(id: string, name: string): string {
  return `⟦task:${id}|${name}⟧`;
}
