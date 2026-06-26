// Convierte las bases de Notion (Tasks Tracker, CRM, Planeación) en los tipos
// que ya usa la UI. Solo se ejecuta del lado servidor.

import { queryAll, type NotionPage } from "./client";
import type { Member, Client, Project, Task, TaskType } from "@/lib/mock-data";

const DB = {
  tasks: process.env.NOTION_DB_TASKS || "",
  crm: process.env.NOTION_DB_CRM || "",
  planeacion: process.env.NOTION_DB_PLANEACION || "",
  time: process.env.NOTION_DB_TIME || "",
};

const MEMBER_COLORS = [
  "var(--color-curva-teal)",
  "var(--color-curva-blue)",
  "var(--color-curva-purple)",
  "var(--color-curva-indigo)",
  "var(--color-curva-pink)",
];
const TYPE_COLORS = [
  "var(--color-curva-purple)",
  "var(--color-curva-blue)",
  "var(--color-curva-teal)",
  "var(--color-curva-pink)",
  "var(--color-curva-indigo)",
];

// --- helpers de lectura de propiedades ---
const P = (pg: NotionPage, name: string) => pg.properties[name];
const title = (pg: NotionPage, name: string) =>
  (P(pg, name)?.title || []).map((t) => t.plain_text).join("").trim();
const selName = (pg: NotionPage, name: string) => P(pg, name)?.select?.name || "";
const statusName = (pg: NotionPage, name: string) => P(pg, name)?.status?.name || "";
const relIds = (pg: NotionPage, name: string) =>
  (P(pg, name)?.relation || []).map((r) => r.id);
const peopleList = (pg: NotionPage, name: string) =>
  (P(pg, name)?.people || []).map((u) => ({
    id: u.id,
    name: u.name || "",
    email: u.person?.email || "",
  }));
const rollupNum = (pg: NotionPage, name: string) => P(pg, name)?.rollup?.number ?? null;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// --- Registros de tiempo (historial real desde Notion) ---
export type TimeRecord = {
  id: string;
  taskId: string;
  person: string;
  start: string; // ISO
  minutes: number;
  inactiveMinutes: number;
  mode: "manual" | "ai"; // manual (tus manos) o ai (espera/IA trabajando)
};

export async function getTimeRecords(): Promise<TimeRecord[]> {
  if (!DB.time) return [];
  const pages = await queryAll(DB.time, {
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  });
  return pages
    .map((pg) => {
      const rich = (P(pg, "Persona")?.rich_text || []).map((t) => t.plain_text).join("");
      return {
        id: pg.id,
        taskId: (P(pg, "Tarea")?.relation || [])[0]?.id || "",
        person: rich.trim(),
        start: P(pg, "Inicio")?.date?.start || "",
        minutes: P(pg, "Minutos")?.number || 0,
        inactiveMinutes: P(pg, "Min. inactivos")?.number || 0,
        mode: (P(pg, "Modo")?.select?.name === "IA" ? "ai" : "manual") as "manual" | "ai",
      };
    })
    .filter((r) => r.minutes > 0);
}

export type CurvaData = {
  members: Member[];
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  taskTypes: TaskType[];
};

export async function getCurvaData(): Promise<CurvaData> {
  const [taskPages, clientPages, projectPages] = await Promise.all([
    queryAll(DB.tasks),
    queryAll(DB.crm),
    queryAll(DB.planeacion),
  ]);

  // Clientes (CRM - Curva)
  const clients: Client[] = clientPages.map((pg) => ({
    id: pg.id,
    name: title(pg, "Name") || "(sin nombre)",
    phase: selName(pg, "Módulo") || "—",
    status: (selName(pg, "Estado del Cliente") || "—") as Client["status"],
  }));

  // Proyectos (Planeación Curva)
  const projects: Project[] = projectPages.map((pg) => ({
    id: pg.id,
    name: title(pg, "Nombre") || "(sin nombre)",
    clientId: relIds(pg, "Cliente")[0] || "",
  }));

  // Tareas + recolectar personas y tipos sobre la marcha
  const memberMap = new Map<string, { id: string; name: string; email: string }>();
  const typeMap = new Map<string, string>();

  const tasks: Task[] = taskPages.map((pg) => {
    const resp = peopleList(pg, "Responsable");
    const aux = peopleList(pg, "Auxiliar");
    [...resp, ...aux].forEach((u) => {
      if (u.id && !memberMap.has(u.id)) memberMap.set(u.id, u);
    });

    const tipo = selName(pg, "Tipo");
    const typeId = tipo ? slug(tipo) : "sin-tipo";
    if (tipo) typeMap.set(typeId, tipo);

    const mins = rollupNum(pg, "Horas registradas");

    return {
      id: pg.id,
      name: title(pg, "Task name") || "(sin nombre)",
      responsableId: resp[0]?.id || "",
      auxiliarId: aux[0]?.id || undefined,
      responsableIds: resp.map((u) => u.id).filter(Boolean),
      auxiliarIds: aux.map((u) => u.id).filter(Boolean),
      clientId: relIds(pg, "Cliente")[0] || "",
      projectId: relIds(pg, "Planeación")[0] || "",
      typeId,
      status: statusName(pg, "Status") || "Sin empezar",
      baselineSeconds: mins ? Math.round(mins * 60) : 0,
      weight: (selName(pg, "Peso") || undefined) as Task["weight"],
      priority: (selName(pg, "Prioridad") || undefined) as Task["priority"],
      internal: P(pg, "Interno")?.checkbox ?? false,
      dueDate: P(pg, "Due date")?.date?.start || undefined,
      createdAt: P(pg, "Fecha de creación")?.created_time || undefined,
    };
  });

  // Equipo: derivado de las personas asignadas en tareas (garantiza el match)
  const members: Member[] = [...memberMap.values()].map((u, i) => ({
    id: u.id,
    name: u.name || "—",
    short: initials(u.name),
    role: u.email || "Equipo CURVA",
    email: u.email || "",
    color: MEMBER_COLORS[i % MEMBER_COLORS.length],
  }));

  // Tipos de tarea
  const taskTypes: TaskType[] = [
    { id: "sin-tipo", label: "Sin tipo", color: "var(--color-ink-soft)" },
    ...[...typeMap.entries()].map(([id, label], i) => ({
      id,
      label,
      color: TYPE_COLORS[i % TYPE_COLORS.length],
    })),
  ];

  return { members, clients, projects, tasks, taskTypes };
}
