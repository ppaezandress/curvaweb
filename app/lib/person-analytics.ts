// Motor de análisis de UNA persona en un rango. Responde lo que un socio necesita saber al
// abrir a alguien del equipo: en qué se le fue el tiempo, qué proyecto se llevó más, cómo
// viene por día y por semana, y si va arriba o abajo de su periodo anterior.
//
// Función pura (sin React, sin red): se prueba con registros fijos en
// tests/unit/person-analytics.test.ts. Reusa la resolución de metadatos y el agrupador del
// análisis del día (lib/day-analytics.ts) para que un mismo registro se cuente igual en
// ambas vistas — si el desglose por proyecto de /dia y el de una persona no coincidieran,
// una de las dos estaría mintiendo.
import type { TimeRecord } from "@/lib/notion/fetchers";
import { groupBy, metaFor, type DaySession, type Group, type Maps } from "@/lib/day-analytics";
import { mondayOf, firstDayOfMonth, monthLabel } from "@/lib/date";

const DAY = 86_400_000;
const MEETINGY = /reuni|junta|llamada|visita/i;
const DEEP_MIN = 50;

export type TaskLoad = {
  taskId: string;
  name: string;
  project: string;
  client?: string;
  minutes: number;
  sessions: number;
};

export type Point = { start: number; minutes: number; label?: string };

export type PeriodKind = "week" | "month" | "all";
export type Period = {
  from: number;
  to: number;
  prev?: { from: number; to: number };
  label: string;
  /** false cuando ya no se puede avanzar más (el periodo actual es el presente). */
  canGoNext: boolean;
};

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Ventana de tiempo a mirar. `offset` navega hacia atrás (-1 = semana/mes anterior).
 * Semanas de lunes a domingo y meses naturales, como el resto del producto.
 */
export function periodFor(kind: PeriodKind, offset: number, now = Date.now()): Period {
  if (kind === "all") {
    return { from: 0, to: now + DAY, label: "Todo el histórico", canGoNext: false };
  }

  if (kind === "week") {
    const base = mondayOf(new Date(now));
    base.setDate(base.getDate() + offset * 7);
    const from = base.getTime();
    const to = from + 7 * DAY;
    const end = new Date(to - DAY);
    const label =
      offset === 0 ? "Esta semana"
      : offset === -1 ? "Semana pasada"
      : `${base.getDate()} ${MESES_CORTOS[base.getMonth()]} – ${end.getDate()} ${MESES_CORTOS[end.getMonth()]}`;
    return { from, to, prev: { from: from - 7 * DAY, to: from }, label, canGoNext: offset < 0 };
  }

  const base = firstDayOfMonth(new Date(now));
  base.setMonth(base.getMonth() + offset);
  const from = base.getTime();
  const next = new Date(base);
  next.setMonth(next.getMonth() + 1);
  const prevStart = new Date(base);
  prevStart.setMonth(prevStart.getMonth() - 1);
  return {
    from,
    to: next.getTime(),
    prev: { from: prevStart.getTime(), to: from },
    label: offset === 0 ? "Este mes" : monthLabel(base),
    canGoNext: offset < 0,
  };
}

export type PersonAnalysis = ReturnType<typeof analyzePerson>;

/** Sesiones de una persona dentro de [from, to), ya enriquecidas con proyecto/cliente/pilar. */
export function sessionsOf(
  records: TimeRecord[],
  person: string,
  from: number,
  to: number,
  maps: Maps,
  now = Date.now(),
): DaySession[] {
  const meta = metaFor(maps);
  const who = person.trim();
  const out: DaySession[] = [];
  for (const r of records) {
    if ((r.person || "").trim() !== who) continue;
    const ms = new Date(r.start).getTime();
    if (isNaN(ms) || ms < from || ms >= to) continue;
    // Nada del futuro: un registro mal fechado no puede inflar el total de nadie.
    if (ms > now) continue;
    if (!(r.minutes > 0)) continue;
    const end = r.end ? new Date(r.end).getTime() : ms + r.minutes * 60000;
    out.push({
      id: r.id,
      start: ms,
      end: Math.max(end, ms),
      minutes: r.minutes,
      inactiveMinutes: r.inactiveMinutes || 0,
      taskId: r.taskId,
      origin: r.origin,
      mode: r.mode,
      activity: (r.activity || "").trim() || "Trabajo enfocado",
      ...meta(r.taskId),
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Serie por día natural, con los días vacíos incluidos (los huecos también son información). */
function seriesByDay(sessions: DaySession[], from: number, to: number): Point[] {
  const per = new Map<number, number>();
  for (const s of sessions) {
    const d = new Date(s.start);
    d.setHours(0, 0, 0, 0);
    per.set(d.getTime(), (per.get(d.getTime()) || 0) + s.minutes);
  }
  const out: Point[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  // Tope defensivo: un rango "todo" con datos viejos no debe generar miles de barras.
  for (let i = 0; cursor.getTime() < to && i < 400; i++) {
    const k = cursor.getTime();
    out.push({ start: k, minutes: Math.round(per.get(k) || 0) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Serie por semana (lunes a domingo, como el resto del producto). */
function seriesByWeek(sessions: DaySession[]): Point[] {
  const per = new Map<number, number>();
  for (const s of sessions) {
    const wk = mondayOf(new Date(s.start)).getTime();
    per.set(wk, (per.get(wk) || 0) + s.minutes);
  }
  return [...per.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, minutes]) => ({ start, minutes: Math.round(minutes) }));
}

function topTasks(sessions: DaySession[], limit = 8): TaskLoad[] {
  const m = new Map<string, TaskLoad>();
  for (const s of sessions) {
    const key = s.taskId || `sin:${s.project}`;
    const cur = m.get(key);
    if (cur) {
      cur.minutes += s.minutes;
      cur.sessions += 1;
    } else {
      m.set(key, {
        taskId: s.taskId,
        name: s.task || "(sin tarea ligada)",
        project: s.project,
        client: s.client,
        minutes: s.minutes,
        sessions: 1,
      });
    }
  }
  return [...m.values()]
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit)
    .map((t) => ({ ...t, minutes: Math.round(t.minutes) }));
}

export function analyzePerson(
  input: {
    records: TimeRecord[];
    person: string;
    from: number;
    to: number;
    /** Rango equivalente anterior, para el "vs periodo pasado". */
    prev?: { from: number; to: number };
    now?: number;
  },
  maps: Maps,
) {
  const now = input.now ?? Date.now();
  const sessions = sessionsOf(input.records, input.person, input.from, input.to, maps, now);

  const totalMin = sessions.reduce((a, s) => a + s.minutes, 0);
  const inactiveMin = sessions.reduce((a, s) => a + s.inactiveMinutes, 0);
  const activeMin = Math.max(0, totalMin - inactiveMin);
  const focusPct = totalMin > 0 ? Math.round((activeMin / totalMin) * 100) : 0;

  const dayKeys = new Set(sessions.map((s) => new Date(s.start).setHours(0, 0, 0, 0)));
  const activeDays = dayKeys.size;
  // Dos promedios distintos y ambos honestos: por día trabajado (intensidad) y por día del
  // calendario (ritmo sostenido). Mezclarlos es como se fabrican métricas que no significan nada.
  const avgPerActiveDay = activeDays ? Math.round(totalMin / activeDays) : 0;
  const calendarDays = Math.max(1, Math.ceil((Math.min(input.to, now) - input.from) / DAY));
  const avgPerCalendarDay = Math.round(totalMin / calendarDays);

  const billableMin = sessions.filter((s) => s.billable).reduce((a, s) => a + s.minutes, 0);
  const billablePct = totalMin > 0 ? Math.round((billableMin / totalMin) * 100) : 0;
  const meetingMin = sessions.filter((s) => MEETINGY.test(s.activity)).reduce((a, s) => a + s.minutes, 0);
  const meetingPct = totalMin > 0 ? Math.round((meetingMin / totalMin) * 100) : 0;
  const deepBlocks = sessions.filter((s) => s.minutes >= DEEP_MIN).length;

  const byProject = groupBy(sessions, (s) => ({ key: s.projectKey, label: s.project, sublabel: s.client }), totalMin);
  const byClient = groupBy(sessions, (s) => ({ key: s.client || "interno", label: s.client || "Interno CURVA" }), totalMin);
  const byPilar = groupBy(sessions, (s) => ({ key: s.pilar || "sin", label: s.pilar || "Sin pilar", color: s.pilarColor }), totalMin);
  const byActivity = groupBy(sessions, (s) => ({ key: s.activity, label: s.activity }), totalMin);

  const byDay = seriesByDay(sessions, input.from, Math.min(input.to, now + DAY));
  const byWeek = seriesByWeek(sessions);
  const bestDay = byDay.reduce<Point | null>((mx, p) => (!mx || p.minutes > mx.minutes ? p : mx), null);

  // Comparativa con el periodo anterior.
  let prevTotalMin = 0;
  let deltaPct: number | null = null;
  if (input.prev) {
    const prevSessions = sessionsOf(input.records, input.person, input.prev.from, input.prev.to, maps, now);
    prevTotalMin = Math.round(prevSessions.reduce((a, s) => a + s.minutes, 0));
    deltaPct = prevTotalMin > 0 ? Math.round(((totalMin - prevTotalMin) / prevTotalMin) * 100) : null;
  }

  return {
    person: input.person,
    sessions: [...sessions].reverse(), // bitácora: lo más reciente primero
    totalMin: Math.round(totalMin),
    activeMin: Math.round(activeMin),
    inactiveMin: Math.round(inactiveMin),
    focusPct,
    activeDays,
    avgPerActiveDay,
    avgPerCalendarDay,
    billableMin: Math.round(billableMin),
    billablePct,
    meetingMin: Math.round(meetingMin),
    deepMin: Math.round(totalMin - meetingMin),
    meetingPct,
    deepBlocks,
    sessionCount: sessions.length,
    byProject,
    byClient,
    byPilar,
    byActivity,
    byDay,
    byWeek,
    bestDay,
    topTasks: topTasks(sessions),
    prevTotalMin,
    deltaPct,
  };
}

export type { Group };
