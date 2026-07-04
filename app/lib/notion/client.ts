// Cliente de Notion del lado SERVIDOR. El token nunca sale al navegador.
// Usamos fetch directo con la versión 2022-06-28 (probada y estable),
// en vez del SDK, para evitar sorpresas de versiones.

// Nombre propio (CURVA_*) para no chocar con un NOTION_TOKEN heredado del entorno.
const TOKEN = (process.env.CURVA_NOTION_TOKEN || process.env.NOTION_TOKEN || "").trim();
const VERSION = "2022-06-28";
const BASE = "https://api.notion.com/v1";

export function notionConfigured() {
  return TOKEN.startsWith("ntn_") || TOKEN.startsWith("secret_");
}

const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function notionFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let attempt = 0;
  // Reintenta ante rate-limit (429) y errores transitorios de Notion (5xx), respetando el
  // header Retry-After. Cubre queryAll (lecturas) y los POST (registro de tiempo/tareas), así
  // un burst de dos usuarios recargando a la vez ya no tira los datos a "mock".
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
      attempt += 1;
      await sleep(backoff);
      continue;
    }
    const body = await res.text();
    throw new Error(`Notion ${res.status}: ${body}`);
  }
}

type QueryResponse = {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
};

export type NotionPage = {
  id: string;
  properties: Record<string, NotionProp>;
};

// Solo las formas de propiedad que usamos.
export type NotionProp = {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  select?: { name: string } | null;
  status?: { name: string } | null;
  relation?: { id: string }[];
  people?: { id: string; name?: string; person?: { email?: string } }[];
  rollup?: { number?: number | null };
  date?: { start: string; end?: string | null } | null;
  number?: number | null;
  checkbox?: boolean;
  created_time?: string;
};

/** Trae TODAS las páginas de una base (paginando). */
export async function queryAll(
  databaseId: string,
  body: Record<string, unknown> = {},
): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionFetch<QueryResponse>(
      `/databases/${databaseId}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
          ...body,
        }),
      },
    );
    out.push(...(data.results || []));
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}
