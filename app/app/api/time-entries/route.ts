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

type Attendee = { name: string; minutes: number };

async function createRow(props: {
  taskId?: string;
  clientId?: string;
  taskName?: string;
  userName: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  inactiveMinutes?: number;
  area?: string;
}) {
  const title = `${props.userName || "—"} · ${(props.taskName || props.area || "Tiempo").slice(0, 50)}`;
  const properties: Record<string, unknown> = {
    Nombre: { title: [{ text: { content: title } }] },
    Persona: { rich_text: [{ text: { content: props.userName || "" } }] },
    Inicio: { date: { start: new Date(props.startedAt).toISOString() } },
    Fin: { date: { start: new Date(props.endedAt).toISOString() } },
    Minutos: { number: props.minutes },
  };
  if (props.taskId) properties["Tarea"] = { relation: [{ id: props.taskId }] };
  if (props.clientId) properties["Cliente"] = { relation: [{ id: props.clientId }] };
  if (props.area) properties["Área"] = { select: { name: props.area } };
  if (props.inactiveMinutes && props.inactiveMinutes > 0)
    properties["Min. inactivos"] = { number: Math.round(props.inactiveMinutes * 10) / 10 };
  const page = await notionFetch<{ id: string }>("/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: DB }, properties }),
  });
  return page.id;
}

// POST: crea registro(s) de tiempo.
//  - Cronómetro: { taskId, taskName, userName, startedAt, endedAt, seconds }
//  - Manual:     { taskId?, clientId?, area, startedAt, endedAt, attendees:[{name,minutes}] }
//    → crea UNA fila por asistente (cada quien con sus minutos: "se fue antes").
export async function POST(req: Request) {
  if (!notionConfigured() || !DB) {
    return NextResponse.json({ ok: false, skipped: true });
  }
  try {
    const b = await req.json();
    const { taskId, clientId, taskName, area, startedAt, endedAt } = b;

    // Modo manual con asistentes
    if (Array.isArray(b.attendees) && b.attendees.length > 0) {
      const ids: string[] = [];
      for (const a of b.attendees as Attendee[]) {
        if (!a.minutes || a.minutes <= 0) continue;
        const id = await createRow({
          taskId, clientId, taskName, area,
          userName: a.name,
          startedAt,
          endedAt: startedAt + a.minutes * 60000,
          minutes: Math.round(a.minutes * 10) / 10,
        });
        ids.push(id);
      }
      return NextResponse.json({ ok: true, ids });
    }

    // Modo cronómetro (una persona)
    const minutes = Math.round((Number(b.seconds) / 60) * 10) / 10;
    const inactiveMinutes = b.inactiveSeconds ? (Number(b.inactiveSeconds) / 60) : 0;
    const id = await createRow({
      taskId, clientId, taskName, area,
      userName: b.userName || "",
      startedAt, endedAt, minutes, inactiveMinutes,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
