import { NextResponse } from "next/server";
import { notionFetch, notionConfigured } from "@/lib/notion/client";
import { getTimeRecords } from "@/lib/notion/fetchers";

export const dynamic = "force-dynamic";

const DB = (process.env.NOTION_DB_TIME || "").trim();

// Historial real de registros (para timesheet y reportes).
export async function GET() {
  if (!notionConfigured() || !DB) return NextResponse.json({ records: [] });
  try {
    const records = await getTimeRecords();
    return NextResponse.json({ records });
  } catch (e) {
    return NextResponse.json({ records: [], error: String(e) });
  }
}

// Crea una fila en "Registro de Tiempo" cada vez que se detiene un cronómetro.
export async function POST(req: Request) {
  if (!notionConfigured() || !DB) {
    // Aún no configurada la base: no rompe, solo no sincroniza.
    return NextResponse.json({ ok: false, skipped: true });
  }
  try {
    const { taskId, taskName, userName, startedAt, endedAt, seconds } = await req.json();
    const minutes = Math.round((Number(seconds) / 60) * 10) / 10;
    const title = `${userName || "—"} · ${(taskName || "Tarea").slice(0, 50)}`;

    const page = await notionFetch<{ id: string }>("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: DB },
        properties: {
          Nombre: { title: [{ text: { content: title } }] },
          ...(taskId ? { Tarea: { relation: [{ id: taskId }] } } : {}),
          Persona: { rich_text: [{ text: { content: userName || "" } }] },
          Inicio: { date: { start: new Date(startedAt).toISOString() } },
          Fin: { date: { start: new Date(endedAt).toISOString() } },
          Minutos: { number: minutes },
        },
      }),
    });
    return NextResponse.json({ ok: true, id: page.id });
  } catch (e) {
    // No rompemos el flujo del usuario: el registro queda local de respaldo.
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
