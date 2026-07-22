import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { notionFetch, notionConfigured } from "@/lib/notion/client";
import { requireSession } from "@/lib/auth/guard";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";

const TASKS = (process.env.NOTION_DB_TASKS || "").trim();

// Validación de boundary (Zod): rechaza payloads malformados con un 400 claro.
const CreateTaskSchema = z.object({
  name: z.string().trim().min(1),
  responsableId: z.string().optional(),
  auxiliarIds: z.array(z.string()).optional(),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  weight: z.string().optional(),
  priority: z.string().optional(),
  dueDate: z.string().optional(),
  internal: z.boolean().optional(),
});
const PatchTaskSchema = z.object({
  taskId: z.string().min(1),
  status: z.string().optional(),
  weight: z.string().optional(),
  priority: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  internal: z.boolean().optional(),
  clientId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  responsableIds: z.array(z.string()).optional(),
  auxiliarIds: z.array(z.string()).optional(),
});

// Crear una tarea nueva en el Tasks Tracker.
export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!notionConfigured() || !TASKS) {
    return NextResponse.json({ ok: false, error: "Notion no configurado" }, { status: 400 });
  }
  try {
    const parsed = CreateTaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }
    const { name, responsableId, auxiliarIds, clientId, projectId, weight, priority, dueDate, internal } = parsed.data;
    const properties: Record<string, unknown> = {
      "Task name": { title: [{ text: { content: name.trim() } }] },
      Status: { status: { name: "SIN EMPEZAR" } },
    };
    if (responsableId) properties["Responsable"] = { people: [{ id: responsableId }] };
    if (Array.isArray(auxiliarIds) && auxiliarIds.length)
      properties["Auxiliar"] = { people: auxiliarIds.map((id: string) => ({ id })) };
    if (clientId) properties["Cliente"] = { relation: [{ id: clientId }] };
    if (projectId) properties["Planeación"] = { relation: [{ id: projectId }] };
    if (weight) properties["Esfuerzo"] = { status: { name: weight } };
    if (priority) properties["Prioridad"] = { select: { name: priority } };
    if (dueDate) properties["Due date"] = { date: { start: dueDate } };
    if (internal) properties["Interno"] = { checkbox: true };

    const page = await notionFetch<{ id: string }>("/pages", {
      method: "POST",
      body: JSON.stringify({ parent: { database_id: TASKS }, properties }),
    });
    revalidateTag("curva-data", "max"); // refresca la lista de tareas cacheada
    return NextResponse.json({ ok: true, id: page.id });
  } catch (e) {
    await logError("api/tasks POST", e, { userId: auth.user.id });
    return NextResponse.json({ ok: false, error: "No se pudo procesar la tarea" }, { status: 500 });
  }
}

// Actualizar el Status de una tarea (p. ej. marcar DONE).
// NOTA: por ahora basta con exigir sesión (cierra la escritura anónima / IDOR). El control
// más fino (solo responsable/auxiliar o admin puede editar una tarea dada) queda como
// seguimiento: requiere leer el responsable de la página en Notion antes de cada PATCH.
export async function PATCH(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!notionConfigured()) {
    return NextResponse.json({ ok: false, error: "Notion no configurado" }, { status: 400 });
  }
  try {
    const parsed = PatchTaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }
    const { taskId, status, weight, priority, dueDate, internal, clientId, projectId, responsableIds, auxiliarIds } = parsed.data;
    const properties: Record<string, unknown> = {};
    if (status) properties["Status"] = { status: { name: status } };
    if (weight) properties["Esfuerzo"] = { status: { name: weight } };
    if (priority) properties["Prioridad"] = { select: { name: priority } };
    if (dueDate !== undefined) properties["Due date"] = dueDate ? { date: { start: dueDate } } : { date: null };
    if (typeof internal === "boolean") properties["Interno"] = { checkbox: internal };
    if (clientId !== undefined) properties["Cliente"] = { relation: clientId ? [{ id: clientId }] : [] };
    if (projectId !== undefined) properties["Planeación"] = { relation: projectId ? [{ id: projectId }] : [] };
    if (Array.isArray(responsableIds)) properties["Responsable"] = { people: responsableIds.map((id: string) => ({ id })) };
    if (Array.isArray(auxiliarIds)) properties["Auxiliar"] = { people: auxiliarIds.map((id: string) => ({ id })) };
    if (Object.keys(properties).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada que actualizar" }, { status: 400 });
    }
    await notionFetch(`/pages/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
    revalidateTag("curva-data", "max");
    return NextResponse.json({ ok: true });
  } catch (e) {
    await logError("api/tasks PATCH", e, { userId: auth.user.id });
    return NextResponse.json({ ok: false, error: "No se pudo procesar la tarea" }, { status: 500 });
  }
}
