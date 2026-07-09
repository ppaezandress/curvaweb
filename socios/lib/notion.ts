// Cliente de Notion del lado SERVIDOR — reusa el mismo token que Curva Tiempos.
// El token nunca sale al navegador.
const TOKEN = (process.env.CURVA_NOTION_TOKEN || process.env.NOTION_TOKEN || "").trim();
const VERSION = "2022-06-28";
const BASE = "https://api.notion.com/v1";

export function notionConfigured() {
  return TOKEN.startsWith("ntn_") || TOKEN.startsWith("secret_");
}

const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function notionFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(BASE + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": VERSION,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    if (res.ok) return res.json() as Promise<T>;
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 8000);
      attempt += 1; await sleep(backoff); continue;
    }
    const body = await res.text();
    throw new Error(`Notion ${res.status}: ${body}`);
  }
}

type NotionPage = { id: string; properties: Record<string, NProp> };
type NProp = {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  select?: { name: string } | null;
  status?: { name: string } | null;
};
type QueryResponse = { results: NotionPage[]; has_more: boolean; next_cursor: string | null };

async function queryAll(databaseId: string, body: Record<string, unknown> = {}): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | null = null;
  do {
    const r: QueryResponse = await notionFetch(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({ ...body, start_cursor: cursor ?? undefined, page_size: 100 }),
    });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

const titleOf = (p?: NProp) => p?.title?.map((t) => t.plain_text).join("") || "";

export type Cliente = { id: string; nombre: string; estado: string | null };

// Trae clientes/leads del CRM de Notion (mismo DB que Curva Tiempos: NOTION_DB_CRM).
export async function getClientes(): Promise<Cliente[]> {
  const db = process.env.NOTION_DB_CRM;
  if (!db || !notionConfigured()) return [];
  const pages = await queryAll(db);
  return pages
    .map((pg) => {
      // el título puede llamarse Name/Nombre/Cliente/Empresa según el schema
      let name = "";
      for (const key of Object.keys(pg.properties)) {
        const pr = pg.properties[key];
        if (pr.type === "title") { name = titleOf(pr); break; }
      }
      const estado =
        pg.properties["Estado"]?.select?.name ||
        pg.properties["Status"]?.status?.name ||
        pg.properties["Etapa"]?.select?.name ||
        null;
      return { id: pg.id, nombre: name.trim(), estado };
    })
    .filter((c) => c.nombre);
}
