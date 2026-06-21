// Datos de prueba para el cascarón.
// Modelan lo que VIVE en el Notion de CURVA (Team Tracker, CRM, Planeación, Tasks Tracker).
// Cuando llegue el acceso a Notion, esta capa se reemplaza por lecturas reales del workspace.

export type Level = "Co-fundador" | "Senior" | "Junior";

export type Member = {
  id: string;
  name: string;
  short: string; // inicial(es) para el avatar
  role: string;
  email?: string; // correo (de Notion) — para auto-asignar al iniciar sesión
  level?: Level;
  color: string; // color de marca asignado a la persona
};

export type TaskType = {
  id: string;
  label: string;
  color: string;
};

export type Client = {
  id: string;
  name: string;
  phase: string;
  status: "Propuesta" | "Activo" | "Pausado" | "Terminado" | "Lead";
};

export type Project = {
  id: string;
  name: string;
  clientId: string;
};

export type TaskStatus =
  | "Sin empezar"
  | "En curso"
  | "Por validar"
  | "En espera"
  | "Demorada"
  | "Done";

export type Task = {
  id: string;
  name: string;
  responsableId: string;
  auxiliarId?: string;
  clientId: string;
  projectId: string;
  typeId: string;
  status: string; // nombre del Status en Notion (tolerante)
  // Tiempo histórico ya acumulado (segundos) — del rollup de Notion (o mock).
  baselineSeconds: number;
};

// ---- Equipo (Team Tracker) ----
export const members: Member[] = [
  { id: "andres", name: "Andrés Páez", short: "P", role: "Co-fundador · Estrategia y plataforma", level: "Co-fundador", color: "var(--color-curva-teal)" },
  { id: "balmo", name: "Balmori", short: "B", role: "Co-fundador · Finanzas y modelo", level: "Co-fundador", color: "var(--color-curva-blue)" },
  { id: "ivana", name: "Ivana Garduño", short: "I", role: "Project Manager", level: "Senior", color: "var(--color-curva-purple)" },
  { id: "lomba", name: "Emiliano Lomba", short: "L", role: "Consultor · Innovación y diseño", level: "Senior", color: "var(--color-curva-indigo)" },
  { id: "diana", name: "Diana Lugo", short: "D", role: "Storytelling y comunicación", level: "Junior", color: "var(--color-curva-pink)" },
  { id: "yannik", name: "Yannik Islas", short: "Y", role: "Consultor · RRHH y procesos", level: "Junior", color: "var(--color-curva-blue)" },
];

// ---- Tipos de tarea / área (el campo nuevo que recomendamos en el Tasks Tracker) ----
export const taskTypes: TaskType[] = [
  { id: "benchmark", label: "Benchmark", color: "var(--color-curva-purple)" },
  { id: "reclutamiento", label: "Reclutamiento", color: "var(--color-curva-blue)" },
  { id: "procesos", label: "Manual de procesos", color: "var(--color-curva-teal)" },
  { id: "organigrama", label: "Organigrama", color: "var(--color-curva-indigo)" },
  { id: "propuesta", label: "Propuesta / Deck", color: "var(--color-curva-pink)" },
  { id: "capacitacion", label: "Capacitación", color: "var(--color-curva-teal)" },
  { id: "notion", label: "Implementación Notion/AI", color: "var(--color-curva-indigo)" },
];

// ---- Clientes (CRM - Curva) ----
export const clients: Client[] = [
  { id: "eleva", name: "Grupo Eleva", phase: "Módulo 2", status: "Activo" },
  { id: "va", name: "Va!", phase: "Diagnóstico", status: "Activo" },
  { id: "charly", name: "Charly Alamillo", phase: "Proyecto Flash", status: "Propuesta" },
  { id: "curva", name: "CURVA (interno)", phase: "Operación", status: "Activo" },
];

// ---- Proyectos (Planeación Curva) ----
export const projects: Project[] = [
  { id: "eleva-m2", name: "Eleva · Gobernanza y KPIs", clientId: "eleva" },
  { id: "eleva-recluta", name: "Eleva · Reclutamiento vendedores", clientId: "eleva" },
  { id: "va-diag", name: "Va! · Diagnóstico de viabilidad", clientId: "va" },
  { id: "charly-web", name: "Charly · Página web", clientId: "charly" },
  { id: "curva-ops", name: "CURVA · Operación interna", clientId: "curva" },
];

// ---- Tareas (Tasks Tracker) ----
export const tasks: Task[] = [
  { id: "t1", name: "Benchmark competitivo de comercializadoras", responsableId: "diana", auxiliarId: "ivana", clientId: "va", projectId: "va-diag", typeId: "benchmark", status: "En curso", baselineSeconds: 4 * 3600 + 1500 },
  { id: "t2", name: "Matriz de posicionamiento de competidores", responsableId: "lomba", clientId: "va", projectId: "va-diag", typeId: "benchmark", status: "Sin empezar", baselineSeconds: 0 },
  { id: "t3", name: "Plan de prospección de vendedores", responsableId: "yannik", auxiliarId: "ivana", clientId: "eleva", projectId: "eleva-recluta", typeId: "reclutamiento", status: "En curso", baselineSeconds: 2 * 3600 + 600 },
  { id: "t4", name: "Manual de proceso de cobranza", responsableId: "ivana", clientId: "eleva", projectId: "eleva-m2", typeId: "procesos", status: "Por validar", baselineSeconds: 3 * 3600 + 2400 },
  { id: "t5", name: "Esquema de comisiones y bonos", responsableId: "balmo", clientId: "eleva", projectId: "eleva-recluta", typeId: "reclutamiento", status: "En espera", baselineSeconds: 3600 + 1800 },
  { id: "t6", name: "Diseño de organigrama y evento de lanzamiento", responsableId: "diana", auxiliarId: "lomba", clientId: "eleva", projectId: "eleva-m2", typeId: "organigrama", status: "En curso", baselineSeconds: 5 * 3600 },
  { id: "t7", name: "Deck de propuesta para Charly Alamillo", responsableId: "lomba", auxiliarId: "andres", clientId: "charly", projectId: "charly-web", typeId: "propuesta", status: "Demorada", baselineSeconds: 2 * 3600 + 900 },
  { id: "t8", name: "Clase de Notion: OKRs y KPIs", responsableId: "andres", clientId: "eleva", projectId: "eleva-m2", typeId: "capacitacion", status: "Sin empezar", baselineSeconds: 0 },
  { id: "t9", name: "Minutas automáticas con Notion AI", responsableId: "andres", auxiliarId: "ivana", clientId: "curva", projectId: "curva-ops", typeId: "notion", status: "En curso", baselineSeconds: 6 * 3600 + 1200 },
  { id: "t10", name: "Página web de Charly (maqueta)", responsableId: "andres", clientId: "charly", projectId: "charly-web", typeId: "propuesta", status: "En curso", baselineSeconds: 3 * 3600 },
  { id: "t11", name: "Empathy map y user persona del cliente Va!", responsableId: "ivana", auxiliarId: "diana", clientId: "va", projectId: "va-diag", typeId: "benchmark", status: "Sin empezar", baselineSeconds: 0 },
  { id: "t12", name: "Capacitación de SoftCrédito", responsableId: "yannik", clientId: "eleva", projectId: "eleva-m2", typeId: "capacitacion", status: "Done", baselineSeconds: 4 * 3600 + 1800 },
];

// ---- Índices de ayuda ----
export const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
export const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
export const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
export const taskTypeById = Object.fromEntries(taskTypes.map((t) => [t.id, t]));
export const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));

// Tono del badge según el Status (tolerante a nombres reales de Notion).
export function statusToneClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("done") || s.includes("complet") || s.includes("listo"))
    return "bg-emerald-100 text-emerald-700";
  if (s.includes("curso") || s.includes("progress") || s.includes("haciendo"))
    return "bg-blue-100 text-blue-700";
  if (s.includes("validar") || s.includes("revis"))
    return "bg-amber-100 text-amber-700";
  if (s.includes("espera") || s.includes("hold") || s.includes("pausa"))
    return "bg-purple-100 text-purple-700";
  if (s.includes("demor") || s.includes("atras") || s.includes("blocked"))
    return "bg-rose-100 text-rose-700";
  return "bg-zinc-100 text-zinc-600"; // sin empezar / desconocido
}
