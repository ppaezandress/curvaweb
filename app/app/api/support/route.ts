import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getAdminSupabase } from "@/lib/supabase/server";
import { notionFetch, notionConfigured } from "@/lib/notion/client";
import { rateLimit, clientIp, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const FB_DB = (process.env.NOTION_DB_FEEDBACK || "").trim();
const TYPES: Record<string, string> = { problema: "Problema", idea: "Idea", comentario: "Comentario" };

// Feedback del equipo desde CUALQUIER pantalla: problema / idea / comentario, con captura
// opcional. Aterriza en Notion (DB "Feedback del equipo", lo que el dueño monitorea) y deja
// respaldo en Supabase. La captura se sube a Storage y se enlaza en Notion.
const Schema = z.object({
  type: z.enum(["problema", "idea", "comentario"]).default("comentario"),
  description: z.string().trim().min(2).max(4000),
  page: z.string().max(300).nullish(),
  screenshot: z.string().max(8_000_000).nullish(), // data URL base64
  userAgent: z.string().max(500).nullish(),
  userName: z.string().max(120).nullish(),
});

export async function POST(req: Request) {
  // Anti-abuso: sube capturas base64 y escribe en DB + Notion. Cubeta amplia (feedback
  // legítimo puede venir en ráfaga), pero acotada por IP para frenar spam/DoS.
  const rl = await rateLimit(`support:${clientIp(req)}`, { limit: 20, windowSec: 60 });
  if (!rl.ok) return tooMany(rl.retryAfter);

  const sb = await getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const { type, description, page, screenshot, userAgent, userName } = parsed.data;
  const { data: { user } } = await sb.auth.getUser();
  const admin = getAdminSupabase();

  // 1) Subir la captura a Storage (si la hay) → URL pública para enlazar en Notion.
  let shotUrl: string | null = null;
  if (screenshot && admin && screenshot.startsWith("data:")) {
    try {
      const comma = screenshot.indexOf(",");
      const meta = screenshot.slice(0, comma);
      const b64 = screenshot.slice(comma + 1);
      const ext = meta.includes("png") ? "png" : "jpg";
      const buf = Buffer.from(b64, "base64");
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
      const { error } = await admin.storage.from("feedback").upload(path, buf, {
        contentType: ext === "png" ? "image/png" : "image/jpeg", upsert: false,
      });
      if (!error) shotUrl = admin.storage.from("feedback").getPublicUrl(path).data.publicUrl;
    } catch { /* sin captura, no rompe el feedback */ }
  }

  // 2) Respaldo en Supabase (queryable).
  try {
    await sb.from("support_reports").insert({
      user_id: user?.id ?? null,
      description: `[${TYPES[type]}] ${description}`,
      page: page ?? null, screenshot: shotUrl ?? null, user_agent: userAgent ?? null,
    });
  } catch { /* el destino principal es Notion */ }

  // 3) Crear la página en Notion (lo que el equipo/dueño revisa).
  let notion = false;
  if (notionConfigured() && FB_DB) {
    try {
      const title = description.length > 60 ? description.slice(0, 60) + "…" : description;
      const properties: Record<string, unknown> = {
        "Feedback": { title: [{ text: { content: title || TYPES[type] } }] },
        "Tipo": { select: { name: TYPES[type] } },
        "Persona": { rich_text: [{ text: { content: userName || user?.email || "—" } }] },
        "Pantalla": { rich_text: [{ text: { content: page || "" } }] },
        "Estado": { select: { name: "Nuevo" } },
      };
      if (shotUrl) properties["Captura"] = { url: shotUrl };
      const children: unknown[] = [
        { object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: description } }] } },
      ];
      if (shotUrl) children.push({ object: "block", type: "image", image: { type: "external", external: { url: shotUrl } } });
      await notionFetch("/pages", { method: "POST", body: JSON.stringify({ parent: { database_id: FB_DB }, properties, children }) });
      notion = true;
    } catch { /* quedó el respaldo en Supabase */ }
  }

  return NextResponse.json({ ok: true, notion });
}
