import { NextResponse } from "next/server";
import { notionFetch, notionConfigured } from "@/lib/notion/client";

export const dynamic = "force-dynamic";

const TASKS = (process.env.NOTION_DB_TASKS || "").trim();

// Crear una tarea nueva en el Tasks Tracker.
export async function POST(req: Request) {
  if (!notionConfigured() || !TASKS) {
    return NextResponse.json({ ok: false, error: "Notion no configurado" }, { status: 400 });
  }
  try {
    const { name, responsableId, auxiliarIds, clientId, projectId, weight, internal } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ ok: false, error: "Falta el nombre" }, { status: 400 });
    }
    const properties: Record<string, unknown> = {
      "Task name": { title: [{ text: { content: name.trim() } }] },
      Status: { status: { name: "SIN EMPEZAR" } },
    };
    if (responsableId) properties["Responsable"] = { people: [{ id: responsableId }] };
    if (Array.isArray(auxiliarIds) && auxiliarIds.length)
      properties["Auxiliar"] = { people: auxiliarIds.map((id: string) => ({ id })) };
    if (clientId) properties["CRM - Curva"] = { relation: [{ id: clientId }] };
    if (projectId) properties["Planeación"] = { relation: [{ id: projectId }] };
    if (weight) properties["Peso"] = { select: { name: weight } };
    if (internal) properties["Interno"] = { checkbox: true };

    const page = await notionFetch<{ id: string }>("/pages", {
      method: "POST",
      body: JSON.stringify({ parent: { database_id: TASKS }, properties }),
    });
    return NextResponse.json({ ok: true, id: page.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// Actualizar el Status de una tarea (p. ej. marcar DONE).
export async function PATCH(req: Request) {
  if (!notionConfigured()) {
    return NextResponse.json({ ok: false, error: "Notion no configurado" }, { status: 400 });
  }
  try {
    const { taskId, status, weight, internal } = await req.json();
    if (!taskId) {
      return NextResponse.json({ ok: false, error: "Falta taskId" }, { status: 400 });
    }
    const properties: Record<string, unknown> = {};
    if (status) properties["Status"] = { status: { name: status } };
    if (weight) properties["Peso"] = { select: { name: weight } };
    if (typeof internal === "boolean") properties["Interno"] = { checkbox: internal };
    if (Object.keys(properties).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada que actualizar" }, { status: 400 });
    }
    await notionFetch(`/pages/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
