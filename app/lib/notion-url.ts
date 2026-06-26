// Construye el enlace a una página (tarea) en Notion a partir de su ID.
// Notion acepta el ID sin guiones al final de la URL.
export function notionTaskUrl(taskId: string): string {
  const clean = (taskId || "").replace(/-/g, "");
  return `https://www.notion.so/${clean}`;
}

// Abre la tarea en la APP de escritorio de Notion si está instalada (deep link
// `notion://`); si no abre en ~700ms (no instalada), cae a la versión web.
export function openInNotion(taskId: string) {
  const clean = (taskId || "").replace(/-/g, "");
  if (!clean || typeof window === "undefined") return;
  const app = `notion://www.notion.so/${clean}`;
  const web = `https://www.notion.so/${clean}`;
  let opened = false;
  const onHide = () => { opened = true; }; // la app tomó el foco → esta pestaña se ocultó
  document.addEventListener("visibilitychange", onHide, { once: true });
  setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    if (!opened && !document.hidden) window.open(web, "_blank", "noopener,noreferrer");
  }, 700);
  window.location.href = app;
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
