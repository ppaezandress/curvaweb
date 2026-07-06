// Pulso — la métrica insignia (0-100, semanal). team tac → tic-tac → latido → Pulso.
// Responde de un vistazo "¿cómo va tu semana?". Transparente y explicable.
//
//   Pulso = 100 · (0.30·C + 0.30·V + 0.20·F + 0.20·K)
//     C Consistencia = días activos (L-V) + racha
//     V Volumen      = minutos de la semana vs tu típico
//     F Foco         = qué tan poco tiempo quedó inactivo
//     K Cumplimiento = tus tareas con fecha que NO están vencidas
import type { Task } from "@/lib/mock-data";

// Mínimo estructural que necesita el Pulso (TimeRecord y Rec locales encajan).
export type PulseRecord = { taskId: string; start: string; minutes: number; inactiveMinutes?: number };
import { dayKey, computeStreak } from "@/lib/streaks";
import { isDone } from "@/lib/task-status";
import { mondayOf, dueDateMs } from "@/lib/date";

export type PulseComponents = { C: number; V: number; F: number; K: number };
export type Band = "low" | "mid" | "high";
export type Pulse = {
  score: number;
  components: PulseComponents;
  band: Band;
  headline: string;
  weekMinutes: number;
  baselineMinutes: number;
  activeDays: number;
  streak: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function bandOf(score: number): Band {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

const isWeekday = (ms: number) => {
  const g = new Date(ms).getDay();
  return g >= 1 && g <= 5;
};

/**
 * Calcula el Pulso semanal de una persona.
 * @param records  registros de tiempo de ESA persona (ventana amplia, para base + racha)
 * @param tasks    tareas de ESA persona (para cumplimiento)
 */
export function computePulse(records: PulseRecord[], tasks: Task[], at?: number): Pulse {
  const now = at ?? Date.now();
  const weekStart = mondayOf(new Date(now)).getTime();

  const withMs = records
    .map((r) => ({ r, ms: new Date(r.start).getTime() }))
    .filter((x) => !isNaN(x.ms));

  // --- Semana en curso ---
  const week = withMs.filter((x) => x.ms >= weekStart);
  const weekMinutes = week.reduce((a, x) => a + (x.r.minutes || 0), 0);
  const weekInactive = week.reduce((a, x) => a + (x.r.inactiveMinutes || 0), 0);
  const activeWeekdays = new Set(week.filter((x) => isWeekday(x.ms)).map((x) => dayKey(x.ms))).size;

  // --- Racha (sobre todos los días con actividad) ---
  const allDays = new Set(withMs.map((x) => dayKey(x.ms)));
  const streak = computeStreak(allDays).current;

  // --- Base personal: mediana de minutos/semana de semanas ANTERIORES con datos ---
  const perWeek = new Map<number, number>();
  for (const x of withMs) {
    if (x.ms >= weekStart) continue;
    const wk = mondayOf(new Date(x.ms)).getTime();
    perWeek.set(wk, (perWeek.get(wk) || 0) + (x.r.minutes || 0));
  }
  const priorWeeks = [...perWeek.values()].filter((m) => m > 0);
  const baselineMinutes = median(priorWeeks);
  const isNew = priorWeeks.length < 2;

  // C · Consistencia (0-1)
  const C = 0.7 * clamp(activeWeekdays / 5, 0, 1) + 0.3 * clamp(streak / 10, 0, 1);

  // V · Volumen vs típico (0-1). Sin base fiable → objetivo blando de 90 min/día × 5.
  const V = isNew
    ? clamp(weekMinutes / (5 * 90), 0, 1)
    : clamp(weekMinutes / Math.max(baselineMinutes, 1), 0, 1.2) / 1.2;

  // F · Foco (0-1). Menos minutos inactivos = mejor. Neutral si no hubo trabajo.
  const F = weekMinutes > 0 ? 1 - clamp(weekInactive / weekMinutes, 0, 0.5) / 0.5 : 0.5;

  // K · Cumplimiento (0-1): tus tareas con fecha que NO están vencidas.
  const openDated = tasks.filter((t) => !isDone(t.status) && dueDateMs(t.dueDate) !== null);
  const overdue = openDated.filter((t) => (dueDateMs(t.dueDate) as number) < now).length;
  const K = openDated.length === 0 ? 0.75 : 1 - overdue / openDated.length;

  const score = Math.round(100 * (0.3 * C + 0.3 * V + 0.2 * F + 0.2 * K));
  const components = { C, V, F, K };

  return {
    score,
    components,
    band: bandOf(score),
    headline: headlineFor(score, components, { streak, weekMinutes, overdue }),
    weekMinutes,
    baselineMinutes,
    activeDays: activeWeekdays,
    streak,
  };
}

// Una línea en lenguaje natural: celebra si va bien, señala el punto flojo si no.
function headlineFor(
  score: number,
  c: PulseComponents,
  ctx: { streak: number; weekMinutes: number; overdue: number },
): string {
  if (ctx.weekMinutes === 0) return "Aún no registras tiempo esta semana. Dale play a una tarea.";
  const items = [
    { k: "F", v: c.F, low: "Tu foco bajó: bastante tiempo quedó inactivo.", high: "Foco impecable esta semana." },
    { k: "C", v: c.C, low: "Te faltó constancia: pocos días activos.", high: `Constancia sólida — racha de ${ctx.streak} días.` },
    { k: "V", v: c.V, low: "Registraste menos que tu semana típica.", high: "Gran volumen, por encima de tu típico." },
    { k: "K", v: c.K, low: `Tienes ${ctx.overdue} pendiente${ctx.overdue === 1 ? "" : "s"} vencido${ctx.overdue === 1 ? "" : "s"}.`, high: "Al día con tus fechas." },
  ];
  if (score >= 75) {
    const top = items.reduce((a, b) => (b.v > a.v ? b : a));
    return top.high;
  }
  const low = items.reduce((a, b) => (b.v < a.v ? b : a));
  return low.low;
}

/** Pulso de equipo: promedio de los que trabajaron + distribución por banda. */
export function teamPulse(scores: number[]): { avg: number; dist: Record<Band, number> } {
  const active = scores.filter((s) => s > 0);
  const avg = active.length ? Math.round(active.reduce((a, b) => a + b, 0) / active.length) : 0;
  const dist: Record<Band, number> = { low: 0, mid: 0, high: 0 };
  for (const s of active) dist[bandOf(s)]++;
  return { avg, dist };
}

export const PULSE_LABELS: Record<keyof PulseComponents, string> = {
  C: "Consistencia",
  V: "Volumen",
  F: "Foco",
  K: "Cumplimiento",
};
