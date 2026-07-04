// Curvi · el cerebro de las recomendaciones. HOY es determinista (simulación 10x):
// toma TU historia y devuelve un plan concreto con el porqué. La interfaz (`suggest`,
// `answer`) está pensada para que mañana se reemplace por una llamada a Claude
// (claude-opus-4-8) sin tocar a quien la consume.

import type { Task } from "@/lib/mock-data";
import { formatDuration } from "@/lib/format";
import { dueDateMs } from "@/lib/date";

export type CurviRec = { taskId: string; start: string; minutes: number };
type Weight = "Ligera" | "Media" | "Pesada";

export type CurviContext = {
  now: number;
  tasks: Task[]; // mis tareas accionables (no done)
  records: CurviRec[]; // mis registros de tiempo (historial)
  taskWeightById: Record<string, Weight | undefined>; // peso de TODAS las tareas (para benchmarks)
  meeting: { connected: boolean; count: number; hours: number };
  streak: number;
  loggedTodayMin: number;
};

export type Move = {
  taskId: string;
  title: string;
  reason: string;
  estMin: number;
  tone: "urgent" | "normal" | "calm";
};

export type Energy = { slot: string; label: string; emoji: string; isPeak: boolean };

export type CurviSuggestion = {
  brief: string;
  energy: Energy;
  plan: Move[];
  nudges: { overdue: number; delayed: number; soon: number; loadMin: number };
};

const SLOTS = [
  { key: "madrugada", from: 0, to: 5, label: "Madrugada", emoji: "🌙" },
  { key: "amanecer", from: 5, to: 8, label: "Amanecer", emoji: "🌅" },
  { key: "mañana", from: 8, to: 12, label: "Mañana", emoji: "☀️" },
  { key: "tarde", from: 12, to: 18, label: "Tarde", emoji: "🌤️" },
  { key: "atardecer", from: 18, to: 21, label: "Atardecer", emoji: "🌆" },
  { key: "noche", from: 21, to: 24, label: "Noche", emoji: "🦉" },
];
const slotIdx = (h: number) => SLOTS.findIndex((s) => h >= s.from && h < s.to);

const DEFAULT_EST: Record<Weight, number> = { Ligera: 30, Media: 90, Pesada: 180 };

const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

type DueState = "overdue" | "today" | "soon" | "none";
function dueState(t: Task, now: number): DueState {
  if (!t.dueDate) return "none";
  const due = dueDateMs(t.dueDate);
  if (due == null) return "none";
  const today0 = startOfDay(now);
  const today1 = today0 + 86_400_000;
  if (due < today0) return "overdue";
  if (due < today1) return "today";
  if (due < today0 + 3 * 86_400_000) return "soon";
  return "none";
}
const isDelayed = (t: Task) => /demor|atras|blocked|espera|hold/i.test(t.status);
const isInProgress = (t: Task) => /curso|progress|haciendo/i.test(t.status);
const isFresh = (t: Task, now: number) => !!t.createdAt && now - new Date(t.createdAt).getTime() < 48 * 3_600_000;

// Benchmarks personales: promedio real de minutos por esfuerzo (si hay ≥2 muestras).
function personalEstimates(records: CurviRec[], weightById: Record<string, Weight | undefined>) {
  const perTask = new Map<string, number>();
  records.forEach((r) => perTask.set(r.taskId, (perTask.get(r.taskId) || 0) + r.minutes));
  const buckets: Record<Weight, number[]> = { Ligera: [], Media: [], Pesada: [] };
  perTask.forEach((min, id) => { const w = weightById[id]; if (w && min > 0) buckets[w].push(min); });
  const avg = (a: number[]) => (a.length >= 2 ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return { Ligera: avg(buckets.Ligera), Media: avg(buckets.Media), Pesada: avg(buckets.Pesada) };
}
function estimateFor(t: Task, pers: Record<Weight, number>): number {
  const w = t.weight;
  if (!w) return 60;
  return Math.round(pers[w] >= 10 ? pers[w] : DEFAULT_EST[w]);
}

function energyProfile(records: CurviRec[]) {
  const per = new Array(SLOTS.length).fill(0);
  records.forEach((r) => { const i = slotIdx(new Date(r.start).getHours()); if (i >= 0) per[i] += r.minutes; });
  const total = per.reduce((a, b) => a + b, 0);
  const peakIdx = total > 0 ? per.indexOf(Math.max(...per)) : -1;
  return { peakIdx, total };
}

function score(t: Task, now: number): number {
  let s = 0;
  const ds = dueState(t, now);
  if (ds === "overdue") s += 100; else if (ds === "today") s += 45; else if (ds === "soon") s += 15;
  if (isDelayed(t)) s += 40;
  if (isInProgress(t)) s += 10;
  if (t.priority === "Alta") s += 40; else if (t.priority === "Media") s += 15;
  if (isFresh(t, now)) s += 12;
  return s;
}

function reasonFor(t: Task, now: number): { reason: string; tone: Move["tone"] } {
  const ds = dueState(t, now);
  if (ds === "overdue") return { reason: "Lleva rato esperando — vale sacarla hoy", tone: "urgent" };
  if (isDelayed(t)) return { reason: "Se está enfriando", tone: "urgent" };
  if (ds === "today") return { reason: "Es para hoy", tone: "urgent" };
  if (isInProgress(t)) return { reason: "Ya la empezaste — buen momento de cerrarla", tone: "normal" };
  if (t.priority === "Alta") return { reason: "Prioridad alta", tone: "normal" };
  if (ds === "soon") return { reason: "Vence pronto", tone: "normal" };
  if (isFresh(t, now)) return { reason: "Recién te la asignaron", tone: "calm" };
  return { reason: "Buen momento para avanzarla", tone: "calm" };
}

export function suggest(ctx: CurviContext): CurviSuggestion {
  const { tasks, records, taskWeightById, meeting, now } = ctx;
  const pers = personalEstimates(records, taskWeightById);
  const { peakIdx, total } = energyProfile(records);

  const ranked = [...tasks].map((t) => ({ t, s: score(t, now) })).sort((a, b) => b.s - a.s);
  const loadMin = tasks.reduce((a, t) => a + estimateFor(t, pers), 0);

  // Energía ahora
  const curIdx = slotIdx(new Date(now).getHours());
  const cur = SLOTS[curIdx] ?? SLOTS[2];
  const isPeak = total > 0 && peakIdx === curIdx;
  const energy: Energy = {
    slot: cur.key,
    label: isPeak ? "Tu pico de energía" : cur.label,
    emoji: cur.emoji,
    isPeak,
  };

  // Plan: hasta 3 movimientos DISTINTOS y concretos.
  const plan: Move[] = [];
  const used = new Set<string>();
  const push = (t: Task, titlePrefix: string, override?: Partial<Move>) => {
    if (used.has(t.id)) return;
    used.add(t.id);
    const r = reasonFor(t, now);
    plan.push({ taskId: t.id, title: `${titlePrefix}: ${t.name}`, reason: override?.reason ?? r.reason, estMin: estimateFor(t, pers), tone: override?.tone ?? r.tone });
  };

  if (ranked[0]) push(ranked[0].t, "Empieza con");
  // Si estás en tu pico, mete una pesada para aprovecharlo.
  if (isPeak) {
    const heavy = ranked.find((x) => x.t.weight === "Pesada" && !used.has(x.t.id));
    if (heavy) push(heavy.t, "Aprovecha tu pico", { reason: "Rindes más a esta hora — ataca lo pesado ahora", tone: "normal" });
  }
  // Una victoria rápida para ganar impulso.
  const quick = ranked.find((x) => x.t.weight === "Ligera" && !used.has(x.t.id));
  if (quick) push(quick.t, "Gana impulso", { reason: `Tarea corta (~${estimateFor(quick.t, pers)} min) — ciérrala y suma`, tone: "calm" });
  // Rellena hasta 3 con lo siguiente más urgente.
  for (const x of ranked) { if (plan.length >= 3) break; push(x.t, "Sigue con"); }

  // Mentalización del día
  let brief: string;
  const h = meeting.hours.toFixed(1);
  if (meeting.connected && meeting.hours >= 3) brief = `Día de juntas: ~${h}h en ${meeting.count} reuniones. Protege un bloque para lo importante.`;
  else if (meeting.connected && meeting.count > 0) brief = `${meeting.count} ${meeting.count === 1 ? "junta" : "juntas"} hoy (~${h}h). Te queda buen rato — elige bien con qué empezar.`;
  else if (tasks.length === 0) brief = "Sin pendientes asignados. Buen momento para planear o cerrar algo interno.";
  else brief = `Modo foco: ~${formatDuration(loadMin * 60)} de trabajo por delante. Vamos de a una.`;

  return {
    brief,
    energy,
    plan: plan.slice(0, 3),
    nudges: {
      overdue: tasks.filter((t) => dueState(t, now) === "overdue").length,
      delayed: tasks.filter(isDelayed).length,
      soon: tasks.filter((t) => dueState(t, now) === "soon").length,
      loadMin,
    },
  };
}

// Q&A de hábitos — respuestas plantilladas pero ancladas en TU data.
export function answer(question: string, ctx: CurviContext, s: CurviSuggestion): string {
  const q = question.toLowerCase();
  const peak = energyProfile(ctx.records).peakIdx;
  const peakSlot = peak >= 0 ? SLOTS[peak] : null;

  if (/empiez|empezar|qué hago|que hago|primero|arranc/.test(q)) {
    const m = s.plan[0];
    return m ? `Empieza con "${m.title.replace(/^.*?: /, "")}": ${m.reason.toLowerCase()} (~${m.estMin} min). Le doy play si quieres.`
      : "No tienes nada accionable ahora mismo. Buen momento para crear una tarea o tomar un respiro.";
  }
  if (/pico|rindo|mejor hora|energ|cuándo trabaj|cuando trabaj/.test(q)) {
    return peakSlot ? `Rindes más en ${peakSlot.label.toLowerCase()} ${peakSlot.emoji}. Agenda ahí tu tarea más pesada y deja las ligeras para después.`
      : "Aún no tengo suficiente historial para conocer tu mejor hora. Sigue registrando unos días y te lo digo.";
  }
  if (/enfoque|concentr|hábito|habito|mejorar|productiv|disciplin/.test(q)) {
    const peakTxt = peakSlot ? `Bloquea tu ${peakSlot.label.toLowerCase()} para UNA sola tarea pesada y manda las ligeras a otra franja.` : "Trabaja en bloques de una sola tarea a la vez.";
    return `${peakTxt} ${ctx.streak > 1 ? `Llevas ${ctx.streak} días de racha 🔥 — la constancia es lo que más mueve la aguja.` : "Empieza una racha hoy: con registrar una tarea basta."}`;
  }
  if (/hoy|cuánto|cuanto|llevo|registr/.test(q)) {
    return `Hoy llevas ${formatDuration(ctx.loggedTodayMin * 60)} registrados${s.nudges.overdue ? `, y tienes ${s.nudges.overdue} vencida${s.nudges.overdue === 1 ? "" : "s"} esperando.` : ". Vas bien."}`;
  }
  if (/atras|vencid|pendient|deuda/.test(q)) {
    const n = s.nudges;
    return `Tienes ${n.overdue} vencida(s), ${n.delayed} atrasada(s) y ${n.soon} que vencen pronto. Si quieres, arrancamos por la más urgente.`;
  }
  return "Puedo decirte con qué empezar, cuál es tu mejor hora del día, cómo mejorar tu enfoque, o cómo vas hoy. Pregúntame eso 🙂";
}
