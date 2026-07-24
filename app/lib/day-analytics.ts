// Motor de analítica del DÍA. Función pura: toma los registros de tiempo (de Notion +
// recién creados + tramos locales) y devuelve todo lo que se puede saber de la jornada.
// Lo consumen el drawer "Tu día" (vistazo) y la página /dia (análisis profundo).
import type { TimeRecord } from "@/lib/notion/fetchers";
import type { Task, Project, Client, TaskType } from "@/lib/mock-data";
import { dueDateMs } from "@/lib/date";

export type LocalEntry = {
  id: string;
  taskId: string;
  startedAt: number;
  endedAt: number;
  seconds: number;
  inactiveSeconds?: number;
  synced?: boolean;
  notionId?: string;
  mode?: "manual" | "ai";
};

export type DaySession = {
  id: string;
  start: number;
  end: number;
  minutes: number;
  inactiveMinutes: number;
  taskId: string;
  task?: string;
  projectKey: string;
  project: string;
  client?: string;
  billable: boolean;
  pilar?: string;
  pilarColor?: string;
  weight?: string;
  activity: string; // tipo de actividad (Área) — cae a "Trabajo enfocado"
  origin?: "timer" | "manual";
  mode?: "manual" | "ai";
};

export type Group = { key: string; label: string; color: string; minutes: number; pct: number; sublabel?: string };

// Paleta categórica de marca, ordenada para separar el peor par CVD (púrpura↔indigo lejos).
export const CAT = [
  "var(--color-curva-purple)",
  "var(--color-curva-blue)",
  "var(--color-curva-teal)",
  "var(--color-curva-pink)",
  "var(--color-curva-indigo)",
];
const OTHER = "var(--muted)";

// Franjas del día para la distribución.
const SLOT = (h: number) => (h < 12 ? "Mañana" : h < 18 ? "Tarde" : "Noche");
// Actividades que NO son trabajo profundo (juntas/comunicación).
const MEETINGY = /reuni|junta|llamada|visita/i;
const DEEP_MIN = 50; // umbral de "bloque profundo"

type Maps = {
  taskById: Record<string, Task>;
  projectById: Record<string, Project>;
  clientById: Record<string, Client>;
  taskTypeById: Record<string, TaskType>;
};

export function groupBy(sessions: DaySession[], keyOf: (s: DaySession) => { key: string; label: string; sublabel?: string; color?: string }, total: number): Group[] {
  const m = new Map<string, Group>();
  const order: string[] = [];
  for (const s of sessions) {
    const g = keyOf(s);
    if (!m.has(g.key)) { order.push(g.key); m.set(g.key, { key: g.key, label: g.label, color: g.color || "", minutes: 0, pct: 0, sublabel: g.sublabel }); }
    m.get(g.key)!.minutes += s.minutes;
  }
  const out = [...m.values()].sort((a, b) => b.minutes - a.minutes);
  out.forEach((g) => { g.pct = total > 0 ? Math.round((g.minutes / total) * 100) : 0; });
  // Asigna color categórico por orden de aparición si el grupo no trae uno propio.
  order.forEach((k, i) => { const g = m.get(k)!; if (!g.color) g.color = i < CAT.length ? CAT[i] : OTHER; });
  return out;
}

// Metadatos de una tarea (proyecto, cliente, pilar, facturable) — la misma resolución para
// el análisis del día y el de una persona en un rango (lib/person-analytics.ts).
export function metaFor(maps: Maps) {
  return (taskId: string) => {
    const t = taskId ? maps.taskById[taskId] : undefined;
    const p = t ? maps.projectById[t.projectId] : undefined;
    const c = t ? maps.clientById[t.clientId] || (p ? maps.clientById[p.clientId] : undefined) : undefined;
    const type = t ? maps.taskTypeById[t.typeId] : undefined;
    return {
      task: t?.name,
      projectKey: p?.id || (t?.internal ? "interno" : t ? `task:${t.id}` : "sin"),
      project: p?.name || (t?.internal ? "Interno" : t?.name || "Sin proyecto"),
      client: c?.name,
      billable: !(t?.internal ?? false),
      pilar: type?.label,
      pilarColor: type?.color,
      weight: t?.weight,
    };
  };
}

export type { Maps };

export function buildDaySessions(
  input: { records: TimeRecord[]; recentEntries: TimeRecord[]; entries: LocalEntry[]; myName: string; dayStart: number; now: number },
  maps: Maps,
): DaySession[] {
  const { records, recentEntries, entries, myName, dayStart, now } = input;
  const dayEnd = dayStart + 86_400_000;
  const meta = metaFor(maps);
  const clean = (a?: string) => (a && a.trim() ? a.trim() : "Trabajo enfocado");

  const known = new Set<string>();
  const out: DaySession[] = [];
  const base = records.filter((r) => (r.person || "").trim() === myName);
  const ids = new Set(base.map((r) => r.id));
  const all = [...base, ...recentEntries.filter((r) => (r.person || "").trim() === myName && !ids.has(r.id))];
  for (const r of all) {
    const ms = new Date(r.start).getTime();
    // Del día seleccionado y NO en el futuro (no puedes haber trabajado en una hora que
    // no ha llegado — descarta registros mal fechados). El fin es el Fin REAL de Notion.
    if (!(ms >= dayStart) || ms >= dayEnd || ms > now || !(r.minutes > 0)) continue;
    known.add(r.id);
    const end = r.end ? new Date(r.end).getTime() : ms + r.minutes * 60000;
    const m = meta(r.taskId);
    out.push({ id: r.id, start: ms, end: Math.max(end, ms), minutes: r.minutes, inactiveMinutes: r.inactiveMinutes || 0, taskId: r.taskId, origin: r.origin, mode: r.mode, activity: clean(r.activity), ...m,
      // Sin tarea vinculada (típico de juntas de Google Calendar): muestra el título del
      // registro en vez de caer a "Sin proyecto" (feedback de Balmori).
      task: m.task || r.label });
  }
  for (const e of entries) {
    if (e.synced || !(e.startedAt >= dayStart) || e.startedAt >= dayEnd || e.startedAt > now || (e.seconds || 0) <= 0) continue;
    if (e.notionId && known.has(e.notionId)) continue;
    const mins = Math.round((e.seconds / 60) * 10) / 10;
    out.push({ id: e.id, start: e.startedAt, end: Math.max(e.endedAt, e.startedAt), minutes: mins, inactiveMinutes: Math.round(((e.inactiveSeconds || 0) / 60) * 10) / 10, taskId: e.taskId, origin: "timer", mode: e.mode, activity: "Trabajo enfocado", ...meta(e.taskId) });
  }
  return out.sort((a, b) => a.start - b.start);
}

export type DayAnalysis = ReturnType<typeof analyzeDay>;

export function analyzeDay(
  input: { records: TimeRecord[]; recentEntries: TimeRecord[]; entries: LocalEntry[]; myName: string; dayStart: number; now: number; priorRecords?: TimeRecord[]; priorDays?: number },
  maps: Maps,
) {
  const sessions = buildDaySessions(input, maps);
  const total = sessions.reduce((a, s) => a + s.minutes, 0);
  const inactive = sessions.reduce((a, s) => a + s.inactiveMinutes, 0);
  const active = Math.max(0, total - inactive);
  const focusPct = total > 0 ? Math.round((active / total) * 100) : 0;

  // Desgloses
  const byProject = groupBy(sessions, (s) => ({ key: s.projectKey, label: s.project, sublabel: s.client }), total);
  const byClient = groupBy(sessions, (s) => ({ key: s.client || "interno", label: s.client || "Interno CURVA" }), total);
  const byPilar = groupBy(sessions, (s) => ({ key: s.pilar || "sin", label: s.pilar || "Sin pilar", color: s.pilarColor }), total);
  const byActivity = groupBy(sessions, (s) => ({ key: s.activity, label: s.activity }), total);

  // Facturable vs interno
  const billableMin = sessions.filter((s) => s.billable).reduce((a, s) => a + s.minutes, 0);
  const billablePct = total > 0 ? Math.round((billableMin / total) * 100) : 0;

  // Juntas vs trabajo profundo (por tipo de actividad)
  const meetingMin = sessions.filter((s) => MEETINGY.test(s.activity)).reduce((a, s) => a + s.minutes, 0);
  const deepMin = total - meetingMin;
  const meetingPct = total > 0 ? Math.round((meetingMin / total) * 100) : 0;

  // Forma de las sesiones
  const count = sessions.length;
  const longest = sessions.reduce((mx, s) => (s.minutes > mx ? s.minutes : mx), 0);
  const avg = count ? Math.round(total / count) : 0;
  const deepBlocks = sessions.filter((s) => s.minutes >= DEEP_MIN).length;
  // Cambios de contexto: saltos de proyecto entre sesiones consecutivas.
  let switches = 0;
  for (let i = 1; i < sessions.length; i++) if (sessions[i].projectKey !== sessions[i - 1].projectKey) switches++;

  // Ritmo del día
  const firstStart = sessions.length ? sessions[0].start : 0;
  // "Terminaste" nunca en el futuro: se topa en `now` (hoy) o el fin del día (días pasados).
  const lastEnd = sessions.length ? Math.min(input.now, Math.max(...sessions.map((s) => s.end))) : 0;
  const spanMin = sessions.length ? Math.round((lastEnd - firstStart) / 60000) : 0;
  const gapsMin = Math.max(0, spanMin - total); // dentro de la jornada, tiempo no medido
  const densityPct = spanMin > 0 ? Math.round((total / spanMin) * 100) : 0;
  const bySlot = groupBy(sessions, (s) => { const l = SLOT(new Date(s.start).getHours()); return { key: l, label: l }; }, total);
  const peakSlot = bySlot[0]?.label;
  // Franja horaria pico (bloque de 2h con más minutos)
  const hourBuckets = new Array(24).fill(0) as number[];
  for (const s of sessions) hourBuckets[new Date(s.start).getHours()] += s.minutes;

  // Comparativa vs promedio de días previos
  let avgDayMin = 0, deltaVsAvgPct = 0;
  if (input.priorRecords && input.priorDays && input.priorDays > 0) {
    const mine = input.priorRecords.filter((r) => (r.person || "").trim() === input.myName && new Date(r.start).getTime() < input.dayStart);
    // Solo días con actividad, para no diluir con findes.
    const byDay = new Map<string, number>();
    for (const r of mine) { const k = new Date(r.start).toDateString(); byDay.set(k, (byDay.get(k) || 0) + (r.minutes || 0)); }
    const vals = [...byDay.values()].filter((v) => v > 0);
    avgDayMin = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    deltaVsAvgPct = avgDayMin > 0 ? Math.round(((total - avgDayMin) / avgDayMin) * 100) : 0;
  }

  // Cumplimiento: tareas con due HOY, y cuáles tocaste hoy.
  const dayEnd = input.dayStart + 86_400_000;
  const touched = new Set(sessions.map((s) => s.taskId).filter(Boolean));
  const dueToday = Object.values(maps.taskById).filter((t) => {
    // `new Date("2026-07-15")` se interpreta como UTC → en México (UTC-6) se corría un día
    // atrás y una tarea que vence HOY caía fuera del rango. `dueDateMs` la parsea como fecha
    // local (igual que el resto de la app), así el conteo cuadra con Notion.
    const d = dueDateMs(t.dueDate);
    if (d == null) return false;
    return d >= input.dayStart && d < dayEnd;
  });
  const dueTouched = dueToday.filter((t) => touched.has(t.id)).length;

  return {
    sessions, total, active, inactive, focusPct,
    byProject, byClient, byPilar, byActivity, bySlot,
    billableMin, billablePct, meetingMin, deepMin, meetingPct,
    count, longest, avg, deepBlocks, switches,
    firstStart, lastEnd, spanMin, gapsMin, densityPct, peakSlot, hourBuckets,
    avgDayMin, deltaVsAvgPct,
    dueToday: dueToday.length, dueTouched, tasksTouched: touched.size,
  };
}

export type TrendDay = { dayStart: number; minutes: number; isToday: boolean; weekday: number };

// Tendencia: minutos medidos por día en los últimos `days` (para la tira de barras y navegar
// a días pasados). Cuenta el Inicio de cada registro mío por día LOCAL, sin futuro.
export function dailyTrend(records: TimeRecord[], myName: string, days: number, todayStart: number, now: number): TrendDay[] {
  const mine = records.filter((r) => (r.person || "").trim() === myName && r.minutes > 0);
  const perDay = new Map<number, number>();
  for (const r of mine) {
    const ms = new Date(r.start).getTime();
    if (ms > now) continue;
    const d = new Date(ms); d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    perDay.set(key, (perDay.get(key) || 0) + r.minutes);
  }
  const out: TrendDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const ds = todayStart - i * 86_400_000;
    out.push({ dayStart: ds, minutes: Math.round(perDay.get(ds) || 0), isToday: ds === todayStart, weekday: new Date(ds).getDay() });
  }
  return out;
}
