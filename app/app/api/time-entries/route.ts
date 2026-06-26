import { NextResponse } from "next/server";
import { z } from "zod";
import { notionFetch, notionConfigured } from "@/lib/notion/client";
import { getTimeRecords } from "@/lib/notion/fetchers";

export const dynamic = "force-dynamic";

const DB = (process.env.NOTION_DB_TIME || "").trim();

// Validación de boundary: el registro siempre necesita un rango (start/end) numérico.
const TimeEntrySchema = z.object({
  taskId: z.string().optional(),
  clientId: z.string().optional(),
  taskName: z.string().optional(),
  area: z.string().optional(),
  userName: z.string().optional(),
  startedAt: z.number(),
  endedAt: z.number(),
  seconds: z.number().optional(),
  inactiveSeconds: z.number().optional(),
  mode: z.enum(["manual", "ai"]).optional(),
  attendees: z.array(z.object({ name: z.string(), minutes: z.number() })).optional(),
});

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
  mode?: "manual" | "ai";
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
  // Modo (Manual / IA). Si la propiedad aún no existe en la DB, se reintenta sin ella.
  if (props.mode) properties["Modo"] = { select: { name: props.mode === "ai" ? "IA" : "Manual" } };

  const post = (p: Record<string, unknown>) =>
    notionFetch<{ id: string }>("/pages", {
      method: "POST",
      body: JSON.stringify({ parent: { database_id: DB }, properties: p }),
    });

  try {
    return (await post(properties)).id;
  } catch (e) {
    // La propiedad "Modo" todavía no existe en Notion → registra sin ella (no perder el tiempo).
    if (props.mode && /Modo|is not a property|does not exist|validation_error/i.test(String(e))) {
      const { Modo, ...rest } = properties as { Modo?: unknown };
      void Modo;
      return (await post(rest)).id;
    }
    throw e;
  }
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
    const valid = TimeEntrySchema.safeParse(await req.json());
    if (!valid.success) {
      return NextResponse.json({ ok: false, error: "Datos inválidos", issues: valid.error.issues }, { status: 400 });
    }
    const b = valid.data;
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
      mode: b.mode === "ai" ? "ai" : "manual",
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
