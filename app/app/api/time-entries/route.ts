import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { notionFetch, notionConfigured } from "@/lib/notion/client";
import { getTimeRecords, type TimeRecord } from "@/lib/notion/fetchers";
import { requireSession, getPersona } from "@/lib/auth/guard";

// Un registro de tiempo cambia el historial (time-entries) Y el rollup "Horas registradas"
// de la tarea (baseline en curva-data) → invalidamos ambos para que el próximo reload traiga
// el baseline fresco (clave para que la reconciliación de doble-conteo funcione).
function invalidateTimeCaches() {
  revalidateTag("time-entries", "max");
  revalidateTag("curva-data", "max");
}

export const dynamic = "force-dynamic";

const DB = (process.env.NOTION_DB_TIME || "").trim();

// Validación de boundary: el registro siempre necesita un rango (start/end) numérico.
const TimeEntrySchema = z.object({
  taskId: z.string().optional(),
  clientId: z.string().optional(),
  taskName: z.string().optional(),
  area: z.string().optional(),
  pilar: z.string().optional(),
  userName: z.string().optional(),
  startedAt: z.number(),
  endedAt: z.number(),
  seconds: z.number().optional(),
  inactiveSeconds: z.number().optional(),
  mode: z.enum(["manual", "ai"]).optional(),
  attendees: z.array(z.object({ name: z.string(), minutes: z.number() })).optional(),
});

// El muro individuo/equipo (no ver las HORAS de otros) se aplica AHORA en el servidor, no
// solo en las vistas: para no-admins se ponen en cero los minutos de los registros ajenos,
// pero se conservan persona + fecha para que el board de rachas (días activos, NO horas)
// siga funcionando para todos. Los admins reciben el historial completo.
function redactForNonAdmin(records: TimeRecord[], myName: string): TimeRecord[] {
  return records.map((r) =>
    (r.person || "").trim() === myName ? r : { ...r, minutes: 0, inactiveMinutes: 0 },
  );
}

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!notionConfigured() || !DB) return NextResponse.json({ records: [] });
  try {
    const records = await getTimeRecords();
    const persona = await getPersona(auth.sb, auth.user.id);
    const safe = persona?.is_admin ? records : redactForNonAdmin(records, persona?.name || "");
    return NextResponse.json({ records: safe });
  } catch {
    return NextResponse.json({ records: [] });
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
  pilar?: string;
  mode?: "manual" | "ai";
  origin?: "timer" | "manual";
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
  // Pilar de negocio (Reclutamiento, Benchmark…) — feedback #47: medir tiempo por pilar,
  // no solo por cliente. Notion crea la opción de select sola al escribir un valor nuevo.
  if (props.pilar) properties["Pilar"] = { select: { name: props.pilar } };
  if (props.inactiveMinutes && props.inactiveMinutes > 0)
    properties["Min. inactivos"] = { number: Math.round(props.inactiveMinutes * 10) / 10 };
  // Modo (Manual / IA). Si la propiedad aún no existe en la DB, se reintenta sin ella.
  if (props.mode) properties["Modo"] = { select: { name: props.mode === "ai" ? "IA" : "Manual" } };
  // Origen: cómo se capturó el tiempo — con el Cronómetro (play/stop) o "A mano" (tecleado
  // en el modal Registrar tiempo). Distinto de Modo (que es humano vs IA). Sirve para marcar
  // el registro en el historial. Si la propiedad no existe, se reintenta sin ella (abajo).
  if (props.origin) properties["Origen"] = { select: { name: props.origin === "manual" ? "A mano" : "Cronómetro" } };

  const post = (p: Record<string, unknown>) =>
    notionFetch<{ id: string }>("/pages", {
      method: "POST",
      body: JSON.stringify({ parent: { database_id: DB }, properties: p }),
    });

  try {
    return (await post(properties)).id;
  } catch (e) {
    // Alguna propiedad opcional (Modo / Pilar / Origen) aún no existe en la DB → registra sin
    // las opcionales para no perder el tiempo medido.
    if ((props.mode || props.pilar || props.origin) && /Modo|Pilar|Origen|is not a property|does not exist|validation_error/i.test(String(e))) {
      const { Modo, Pilar, Origen, ...rest } = properties as { Modo?: unknown; Pilar?: unknown; Origen?: unknown };
      void Modo; void Pilar; void Origen;
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
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!notionConfigured() || !DB) {
    return NextResponse.json({ ok: false, skipped: true });
  }
  const persona = await getPersona(auth.sb, auth.user.id);
  try {
    const valid = TimeEntrySchema.safeParse(await req.json());
    if (!valid.success) {
      return NextResponse.json({ ok: false, error: "Datos inválidos", issues: valid.error.issues }, { status: 400 });
    }
    const b = valid.data;
    const { taskId, clientId, taskName, area, pilar, startedAt, endedAt } = b;

    // Modo manual con asistentes ("A mano"). Devolvemos también los registros creados
    // (records) para que el cliente los pinte al instante en el historial, sin esperar a que
    // Notion indexe la página nueva (el lag de indexado hacía que "no apareciera" y el usuario
    // lo registrara de nuevo → duplicados).
    if (Array.isArray(b.attendees) && b.attendees.length > 0) {
      const ids: string[] = [];
      const records: TimeRecord[] = [];
      for (const a of b.attendees as Attendee[]) {
        if (!a.minutes || a.minutes <= 0) continue;
        const mins = Math.round(a.minutes * 10) / 10;
        const id = await createRow({
          taskId, clientId, taskName, area, pilar,
          userName: a.name,
          startedAt,
          endedAt: startedAt + a.minutes * 60000,
          minutes: mins,
          origin: "manual",
        });
        ids.push(id);
        records.push({
          id, taskId: taskId || "", person: a.name,
          start: new Date(startedAt).toISOString(), minutes: mins,
          inactiveMinutes: 0, mode: "manual", origin: "manual",
        });
      }
      invalidateTimeCaches();
      return NextResponse.json({ ok: true, ids, records });
    }

    // Modo cronómetro (una persona): la identidad SIEMPRE es la del usuario autenticado,
    // nunca el userName del body (spoofable). Cae a "" (—) si el perfil no está sembrado.
    const minutes = Math.round((Number(b.seconds) / 60) * 10) / 10;
    const inactiveMinutes = b.inactiveSeconds ? (Number(b.inactiveSeconds) / 60) : 0;
    const id = await createRow({
      taskId, clientId, taskName, area,
      userName: persona?.name || "",
      startedAt, endedAt, minutes, inactiveMinutes,
      mode: b.mode === "ai" ? "ai" : "manual",
      origin: "timer",
    });
    invalidateTimeCaches();
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo registrar el tiempo" });
  }
}

// DELETE: quita una sesión mal registrada (?id=<pageId>). Archiva la página en Notion
// (no borra duro) y refresca el rollup "Horas registradas" de la tarea. Reglas del muro:
// cada quien solo puede quitar SUS propias sesiones; un admin puede quitar cualquiera.
type NotionPageMeta = {
  parent?: { database_id?: string };
  properties?: { Persona?: { rich_text?: { plain_text?: string }[] } };
};

export async function DELETE(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!notionConfigured() || !DB) return NextResponse.json({ ok: false, skipped: true });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta el id de la sesión" }, { status: 400 });

  const persona = await getPersona(auth.sb, auth.user.id);
  try {
    // Trae la página para (a) confirmar que es de ESTA base (no permitir archivar páginas
    // arbitrarias de Notion vía este endpoint) y (b) verificar de quién es el registro.
    const page = await notionFetch<NotionPageMeta>(`/pages/${id}`);
    if ((page.parent?.database_id || "").replace(/-/g, "") !== DB.replace(/-/g, "")) {
      return NextResponse.json({ ok: false, error: "Registro no encontrado" }, { status: 404 });
    }
    const owner = (page.properties?.Persona?.rich_text?.[0]?.plain_text || "").trim();
    if (!persona?.is_admin && owner !== (persona?.name || "").trim()) {
      return NextResponse.json({ ok: false, error: "No puedes quitar el tiempo de otra persona" }, { status: 403 });
    }
    await notionFetch(`/pages/${id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
    invalidateTimeCaches();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo quitar el tiempo" }, { status: 500 });
  }
}
