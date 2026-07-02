"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Clock,
  ArrowRight,
  CheckSquare,
  Users,
  TrendingUp,
  CalendarRange,
  Building2,
  Sparkles,
  Target,
  CalendarCheck,
  Loader2,
  ArrowUp,
  ArrowDown,
  UserRound,
  Lock,
  AlertTriangle,
  Zap,
  Sun,
  CircleCheck,
  Lightbulb,
} from "lucide-react";
import { useData } from "@/lib/data-context";
import { useApp } from "@/lib/app-context";
import { isDone, isAssignedTo } from "@/lib/task-status";
import { formatHours, formatDuration } from "@/lib/format";
import { dayKey } from "@/lib/streaks";
import { mondayOf, firstDayOfMonth, monthShort, DIAS_CORTOS, dueDateMs } from "@/lib/date";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CountUp } from "@/components/anim/CountUp";

type Rec = { id: string; taskId: string; person: string; start: string; minutes: number; mode?: "manual" | "ai" };
type Range = "week" | "month" | "all";

// --- Solapamiento temporal (para el "aprovechamiento" de la espera de IA) ---
type Interval = { s: number; e: number };
function merge(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.s - b.s);
  const out: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i].s <= last.e) last.e = Math.max(last.e, sorted[i].e);
    else out.push({ ...sorted[i] });
  }
  return out;
}
// Minutos de los intervalos de IA que caen dentro de algún intervalo manual.
function overlapMinutes(ai: Interval[], manual: Interval[]): number {
  const m = merge(manual);
  let ms = 0;
  for (const a of ai) {
    for (const x of m) {
      const lo = Math.max(a.s, x.s);
      const hi = Math.min(a.e, x.e);
      if (hi > lo) ms += hi - lo;
    }
  }
  return ms / 60000;
}
function toInterval(r: Rec): Interval {
  const s = new Date(r.start).getTime();
  return { s, e: s + r.minutes * 60000 };
}

// Inicio (epoch ms) del rango seleccionado.
function rangeStart(range: Range): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "week") return mondayOf(d).getTime();
  if (range === "month") {
    d.setDate(1);
    return d.getTime();
  }
  return 0;
}

// Rango anterior del mismo tamaño (para el delta). null cuando es "todo".
function prevRange(range: Range): { start: number; end: number } | null {
  if (range === "all") return null;
  const end = rangeStart(range);
  if (range === "week") return { start: end - 7 * 86_400_000, end };
  const d = new Date(end);
  d.setMonth(d.getMonth() - 1);
  return { start: d.getTime(), end };
}

// Franjas del día (alineadas con el Recap).
const SLOTS = [
  { key: "madrugada", label: "Madrugada", emoji: "🌙", from: 0, to: 5 },
  { key: "amanecer", label: "Amanecer", emoji: "🌅", from: 5, to: 8 },
  { key: "mañana", label: "Mañana", emoji: "☀️", from: 8, to: 12 },
  { key: "tarde", label: "Tarde", emoji: "🌤️", from: 12, to: 18 },
  { key: "atardecer", label: "Atardecer", emoji: "🌆", from: 18, to: 21 },
  { key: "noche", label: "Noche", emoji: "🦉", from: 21, to: 24 },
];
function slotOf(hour: number) {
  return SLOTS.find((s) => hour >= s.from && hour < s.to) ?? SLOTS[SLOTS.length - 1];
}

// "La curva": convierte una serie en un trazo SUAVE (área + línea), no en barras.
// Coordenadas en un viewBox 100×40; el stroke se mantiene crisp con non-scaling-stroke.
function smoothCurve(vals: number[], max: number) {
  const W = 100, H = 40, padY = 4;
  const n = vals.length;
  if (n === 0) return { line: "", area: "" };
  const innerH = H - padY * 2;
  const pts = vals.map((v, i) => ({
    x: n === 1 ? W / 2 : (i / (n - 1)) * W,
    y: padY + innerH - (max > 0 ? (v / max) * innerH : 0),
  }));
  const d = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
  }
  const line = d.join(" ");
  const area = `${line} L ${pts[n - 1].x.toFixed(2)} ${H} L ${pts[0].x.toFixed(2)} ${H} Z`;
  return { line, area };
}

export default function InsightsPage() {
  return <InsightsView />;
}

function InsightsView() {
  const { tasks, taskById, projectById, clientById, memberById, taskTypeById } = useData();
  const { currentUserId, sessionSecondsForTask } = useApp();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [range, setRange] = useState<Range>("month");

  // Panorama de MIS tareas (independiente del cronómetro): estado, carga, cliente,
  // tipo y esfuerzo. Da "mucha data" a cada persona aunque no mida tiempo.
  const panorama = useMemo(() => {
    const mineTasks = tasks.filter((t) => isAssignedTo(t, currentUserId));
    const today0 = new Date().setHours(0, 0, 0, 0);
    const in7 = today0 + 7 * 86_400_000;
    // Conteos (terminadas, por estado/cliente/tipo) acotados al periodo elegido
    // (por fecha de creación). "Todo" = histórico. La CARGA actual (abiertas/
    // vencidas) NO se acota: siempre refleja el estado de hoy.
    const from = rangeStart(range);
    const inRange = (t: (typeof mineTasks)[number]) => range === "all" || (t.createdAt ? new Date(t.createdAt).getTime() >= from : false);
    const scoped = mineTasks.filter(inRange);
    const secsOf = (t: (typeof mineTasks)[number]) => t.baselineSeconds + sessionSecondsForTask(t.id);

    const bucket = (s: string) =>
      isDone(s) ? "Terminadas"
      : /curso|progress|haciendo/i.test(s) ? "En curso"
      : /demor|atras|blocked|vencid/i.test(s) ? "Demoradas"
      : /validar|revis/i.test(s) ? "Por validar"
      : /espera|hold/i.test(s) ? "En espera"
      : "Sin empezar";
    const STATUS_ORDER = ["En curso", "Por validar", "En espera", "Demoradas", "Sin empezar", "Terminadas"] as const;
    const STATUS_TONE: Record<string, string> = {
      "En curso": "bg-accent", "Por validar": "bg-curva-indigo", "En espera": "bg-amber-500",
      "Demoradas": "bg-rose-500", "Sin empezar": "bg-zinc-400", "Terminadas": "bg-emerald-500",
    };
    const statusCount = new Map<string, number>();
    const clientMap = new Map<string, { label: string; count: number; secs: number }>();
    const typeMap = new Map<string, { label: string; count: number }>();
    const weightMap = new Map<string, number>();
    let vencidas = 0, porVencer = 0, sinFecha = 0, abiertas = 0, totalSecs = 0;

    // Conteos por periodo (scoped)
    scoped.forEach((t) => {
      statusCount.set(bucket(t.status), (statusCount.get(bucket(t.status)) || 0) + 1);
      const client = clientById[t.clientId];
      const ckey = t.internal ? "__int" : (client?.id || "__none");
      const clabel = t.internal ? "Interno CURVA" : (client?.name || "Sin cliente");
      const c = clientMap.get(ckey) || { label: clabel, count: 0, secs: 0 };
      c.count++; c.secs += secsOf(t); clientMap.set(ckey, c);
      const type = taskTypeById[t.typeId];
      const tk = type?.label || "Sin tipo";
      const ty = typeMap.get(tk) || { label: tk, count: 0 };
      ty.count++; typeMap.set(tk, ty);
      if (t.weight) weightMap.set(t.weight, (weightMap.get(t.weight) || 0) + 1);
      totalSecs += secsOf(t);
    });
    // Carga ACTUAL (todas mis abiertas, sin acotar por periodo)
    mineTasks.forEach((t) => {
      if (!isDone(t.status)) {
        abiertas++;
        const d = dueDateMs(t.dueDate);
        if (d != null) {
          if (d < today0) vencidas++; else if (d < in7) porVencer++;
        } else sinFecha++;
      }
    });

    const total = scoped.length;
    const done = statusCount.get("Terminadas") || 0;
    const byStatus = STATUS_ORDER.filter((s) => (statusCount.get(s) || 0) > 0)
      .map((s) => ({ label: s, count: statusCount.get(s) || 0, tone: STATUS_TONE[s] }));
    const byClient = [...clientMap.values()].sort((a, b) => b.count - a.count || b.secs - a.secs);
    const byType = [...typeMap.values()].sort((a, b) => b.count - a.count);
    const byWeight = (["Ligera", "Media", "Pesada"] as const).map((w) => ({ label: w, count: weightMap.get(w) || 0 }));
    return { total, done, completion: total ? Math.round((done / total) * 100) : 0, abiertas, vencidas, porVencer, sinFecha, totalSecs, byStatus, byClient, byType, byWeight, clientMax: Math.max(...byClient.map((c) => c.count), 1), typeMax: Math.max(...byType.map((t) => t.count), 1) };
  }, [tasks, currentUserId, sessionSecondsForTask, clientById, taskTypeById, range]);

  // Tareas terminadas MÍAS con su tiempo real (baseline Notion + cronómetro).
  // Solo mostramos las que tienen tiempo; contamos aparte las cerradas sin registro.
  const doneTasks = useMemo(() => {
    const mineDone = tasks.filter((t) => isAssignedTo(t, currentUserId) && isDone(t.status));
    const withTime = mineDone
      .map((t) => ({ task: t, secs: t.baselineSeconds + sessionSecondsForTask(t.id) }))
      .filter((r) => r.secs > 0)
      .sort((a, b) => b.secs - a.secs);
    return { list: withTime.slice(0, 12), total: mineDone.length, timedTotalSec: withTime.reduce((a, r) => a + r.secs, 0), untimed: mineDone.length - withTime.length, maxSec: Math.max(...withTime.map((r) => r.secs), 1) };
  }, [tasks, currentUserId, sessionSecondsForTask]);

  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendMode, setTrendMode] = useState<"weeks" | "months">("weeks");

  useEffect(() => {
    fetch("/api/time-entries")
      .then((r) => r.json())
      .then((d) => setRecords(d.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  // Reveal al scroll: cada sección con .insights-reveal aparece al entrar en viewport
  // (portado del reveal.ts vanilla de la landing). Re-observa cuando cambia el contenido.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const els = Array.from(document.querySelectorAll<HTMLElement>(".insights-reveal:not(.is-visible)"));
    if (reduce) { els.forEach((el) => el.classList.add("is-visible")); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } }),
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // Se re-ejecuta cuando llega la data (records) o cambia el panorama; con eso las
    // secciones nuevas quedan observadas. (smartInsights/doneTasks derivan de lo mismo.)
  }, [loading, records, panorama.total]);


  // "Mi tiempo": SIEMPRE solo tu data (la del equipo vive en /equipo). Si `me` no
  // resolvió, vacío — nunca la de otros.
  const mine = useMemo(() => {
    return me ? records.filter((r) => r.person === me.name) : [];
  }, [records, me]);

  const from = rangeStart(range);
  const inRange = useMemo(
    () => mine.filter((r) => r.start && new Date(r.start).getTime() >= from),
    [mine, from],
  );

  // ---- KPIs + delta vs periodo anterior ----
  const prev = prevRange(range);
  const prevRows = useMemo(() => {
    if (!prev) return null;
    return mine.filter((r) => {
      const t = r.start ? new Date(r.start).getTime() : 0;
      return t >= prev.start && t < prev.end;
    });
  }, [mine, prev]);

  const totalMin = inRange.reduce((a, r) => a + r.minutes, 0);
  const distinctTasks = new Set(inRange.map((r) => r.taskId)).size;
  const distinctPeople = new Set(inRange.map((r) => r.person)).size;

  // ---- Trabajo con IA: tiempo de espera y aprovechamiento ----
  const ai = useMemo(() => {
    const aiMin = inRange.filter((r) => r.mode === "ai").reduce((a, r) => a + r.minutes, 0);
    const manualMin = totalMin - aiMin;
    const share = totalMin > 0 ? Math.round((aiMin / totalMin) * 100) : 0;
    // Aprovechamiento: % del tiempo de IA solapado con trabajo manual (por persona).
    const byPerson = new Map<string, { ai: Interval[]; man: Interval[] }>();
    inRange.forEach((r) => {
      if (!byPerson.has(r.person)) byPerson.set(r.person, { ai: [], man: [] });
      const g = byPerson.get(r.person)!;
      (r.mode === "ai" ? g.ai : g.man).push(toInterval(r));
    });
    let totalAi = 0, overlap = 0;
    byPerson.forEach((g) => {
      totalAi += g.ai.reduce((a, i) => a + (i.e - i.s) / 60000, 0);
      overlap += overlapMinutes(g.ai, g.man);
    });
    const leverage = totalAi > 0 ? Math.round((overlap / totalAi) * 100) : 0;
    return { aiMin, manualMin, share, leverage, hasAI: aiMin > 0 };
  }, [inRange, totalMin]);

  const prevTotalMin = prevRows?.reduce((a, r) => a + r.minutes, 0) ?? null;
  const prevTasks = prevRows ? new Set(prevRows.map((r) => r.taskId)).size : null;
  const prevDays = prevRows ? new Set(prevRows.map((r) => dayKey(new Date(r.start).getTime()))).size : null;
  const activeDays = new Set(inRange.map((r) => dayKey(new Date(r.start).getTime()))).size;

  // ---- Tendencia: últimas 8 semanas (no depende del selector) ----
  const trend = useMemo(() => {
    const start = mondayOf(new Date());
    const weeks: { label: string; minutes: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(start);
      wStart.setDate(wStart.getDate() - i * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 7);
      const minutes = mine
        .filter((r) => {
          const t = r.start ? new Date(r.start).getTime() : 0;
          return t >= wStart.getTime() && t < wEnd.getTime();
        })
        .reduce((a, r) => a + r.minutes, 0);
      weeks.push({ label: `${wStart.getDate()}/${wStart.getMonth() + 1}`, minutes });
    }
    return weeks;
  }, [mine]);

  // ---- Tendencia: últimos 6 meses (corte mensual, para comparar mes a mes) ----
  const trendMonthsData = useMemo(() => {
    const base = firstDayOfMonth(new Date());
    const months: { label: string; minutes: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const mEnd = new Date(base.getFullYear(), base.getMonth() - i + 1, 1);
      const minutes = mine
        .filter((r) => {
          const t = r.start ? new Date(r.start).getTime() : 0;
          return t >= mStart.getTime() && t < mEnd.getTime();
        })
        .reduce((a, r) => a + r.minutes, 0);
      months.push({ label: monthShort(mStart), minutes });
    }
    return months;
  }, [mine]);

  // Datos activos de la tarjeta Tendencia según el modo elegido.
  const trendData = trendMode === "weeks" ? trend : trendMonthsData;
  const trendMax = Math.max(...trendData.map((w) => w.minutes), 1);

  // ---- Ritmo: por día de la semana y por franja del día (en rango) ----
  const byWeekday = useMemo(() => {
    const arr = Array.from({ length: 7 }, () => 0);
    inRange.forEach((r) => {
      const idx = (new Date(r.start).getDay() + 6) % 7; // 0 = lunes
      arr[idx] += r.minutes;
    });
    return arr;
  }, [inRange]);
  const weekdayMax = Math.max(...byWeekday, 1);

  const bySlot = useMemo(() => {
    const m = new Map<string, number>();
    inRange.forEach((r) => {
      const s = slotOf(new Date(r.start).getHours());
      m.set(s.key, (m.get(s.key) || 0) + r.minutes);
    });
    return SLOTS.map((s) => ({ ...s, minutes: m.get(s.key) || 0 }));
  }, [inRange]);
  const slotMax = Math.max(...bySlot.map((s) => s.minutes), 1);

  // ---- Concentración de clientes (riesgo) ----
  const clientKeyOf = (r: Rec) => {
    const task = taskById[r.taskId];
    const project = task ? projectById[task.projectId] : undefined;
    const client = project ? clientById[project.clientId] : undefined;
    return { key: client?.id || "—", label: client?.name || "Sin cliente" };
  };
  const byClient = useMemo(() => {
    const m = new Map<string, { key: string; label: string; minutes: number }>();
    inRange.forEach((r) => {
      const { key, label } = clientKeyOf(r);
      if (!m.has(key)) m.set(key, { key, label, minutes: 0 });
      m.get(key)!.minutes += r.minutes;
    });
    return [...m.values()].sort((a, b) => b.minutes - a.minutes);
  }, [inRange, taskById, projectById, clientById]);
  const clientTotal = byClient.reduce((a, c) => a + c.minutes, 0);
  const topShare = clientTotal > 0 ? Math.round((byClient[0].minutes / clientTotal) * 100) : 0;
  const clientMax = Math.max(...byClient.map((c) => c.minutes), 1);

  // ---- Historial: mis últimos registros (qué hice y cuándo) ----
  const historial = useMemo(() => {
    return [...mine]
      .filter((r) => r.start)
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
      .slice(0, 15)
      .map((r) => {
        const task = taskById[r.taskId];
        const project = task ? projectById[task.projectId] : undefined;
        const client = project ? clientById[project.clientId] : undefined;
        return { id: r.id, when: new Date(r.start), taskName: task?.name || "Registro externo", client: client?.name, minutes: r.minutes, mode: r.mode };
      });
  }, [mine, taskById, projectById, clientById]);

  // Drill-down del cliente seleccionado: su tendencia por semana (6) + top tareas.
  // Perfil personal: rasgos derivados de tu propia data.
  const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const weekendMin = useMemo(
    () => inRange.filter((r) => { const g = new Date(r.start).getDay(); return g === 0 || g === 6; }).reduce((a, r) => a + r.minutes, 0),
    [inRange],
  );
  const weekendPct = totalMin > 0 ? Math.round((weekendMin / totalMin) * 100) : 0;
  const topWeekdayIdx = byWeekday.reduce((best, m, i, arr) => (m > arr[best] ? i : best), 0);
  const topSlotProfile = [...bySlot].sort((a, b) => b.minutes - a.minutes)[0];

  // ── Motor de insights: traduce la data en decisiones accionables ──
  // Cada regla dispara solo si el patrón es real; se ordena por urgencia (riesgo →
  // atención → tip → logro) y se muestran los más relevantes. La meta: que la persona
  // sepa QUÉ hacer con su data, no solo verla.
  const smartInsights = useMemo(() => {
    const out: { tone: "risk" | "watch" | "tip" | "win"; icon: string; title: string; action: string; href?: string }[] = [];
    const enCurso = panorama.byStatus.find((s) => s.label === "En curso")?.count || 0;
    const demoradas = panorama.byStatus.find((s) => s.label === "Demoradas")?.count || 0;
    const topClientTaskPct = panorama.byClient[0] && panorama.total > 0 ? Math.round((panorama.byClient[0].count / panorama.total) * 100) : 0;

    // Riesgo — atención inmediata
    if (panorama.vencidas > 0)
      out.push({ tone: "risk", icon: "alert", title: `${panorama.vencidas} tarea${panorama.vencidas > 1 ? "s" : ""} vencida${panorama.vencidas > 1 ? "s" : ""}`, action: "Priorízalas hoy o mueve su fecha para no arrastrarlas.", href: "/tareas" });
    if (demoradas > 0)
      out.push({ tone: "risk", icon: "alert", title: `${demoradas} tarea${demoradas > 1 ? "s" : ""} demorada${demoradas > 1 ? "s" : ""}`, action: "Detecta qué las traba y pide ayuda si algo te bloquea.", href: "/tareas" });

    // Atención — vigilar
    if (panorama.porVencer > 0)
      out.push({ tone: "watch", icon: "clock", title: `${panorama.porVencer} vence${panorama.porVencer > 1 ? "n" : ""} en 7 días`, action: "Bloquéalas en tu calendario antes de que se junten.", href: "/tareas" });
    if (enCurso >= 4)
      out.push({ tone: "watch", icon: "zap", title: `${enCurso} tareas en curso a la vez`, action: "Cerrar unas antes de abrir más te hace avanzar más rápido." });
    if (totalMin > 0 && topShare >= 55 && byClient[0] && byClient[0].label !== "Sin cliente")
      out.push({ tone: "watch", icon: "building", title: `${topShare}% de tu tiempo en ${byClient[0].label}`, action: "Mucha concentración en un cliente — cuida el balance de tu semana." });
    else if (topClientTaskPct >= 60 && panorama.byClient[0] && panorama.byClient[0].label !== "Sin cliente")
      out.push({ tone: "watch", icon: "building", title: `${topClientTaskPct}% de tus tareas en ${panorama.byClient[0].label}`, action: "Casi todo tu foco está en un cliente." });

    // Tendencia de tiempo (semana vs semana)
    if (trend.length >= 2) {
      const last = trend[trend.length - 1].minutes, prevW = trend[trend.length - 2].minutes;
      if (prevW > 0) {
        const p = Math.round(((last - prevW) / prevW) * 100);
        if (p >= 15) out.push({ tone: "win", icon: "trend", title: `Mediste ${p}% más que la semana pasada`, action: "Vas en subida — mantén el ritmo." });
        else if (p <= -15) out.push({ tone: "watch", icon: "trend", title: `Mediste ${Math.abs(p)}% menos que la semana pasada`, action: "¿Semana distinta, o se te olvidó registrar tu tiempo?" });
      }
    }

    // Tips — cómo mejorar
    if (panorama.sinFecha >= 3)
      out.push({ tone: "tip", icon: "clock", title: `${panorama.sinFecha} tareas abiertas sin fecha`, action: "Ponles fecha de entrega para no perderlas de vista." });
    if (totalMin > 0 && topSlotProfile && topSlotProfile.minutes > 0)
      out.push({ tone: "tip", icon: "sun", title: `Rindes más por la ${topSlotProfile.label.toLowerCase()}`, action: "Agenda tus tareas más pesadas en esa franja del día." });
    if (weekendPct >= 25)
      out.push({ tone: "tip", icon: "alert", title: `Trabajas ${weekendPct}% en fin de semana`, action: "Ojo con el descanso — protege tus fines para sostener el ritmo." });

    // Logros — reforzar
    if (panorama.completion >= 70 && panorama.total >= 3)
      out.push({ tone: "win", icon: "target", title: `Cierras el ${panorama.completion}% de lo que te asignan`, action: "Buen nivel de cumplimiento. ¡Sigue así!" });
    if (panorama.vencidas === 0 && demoradas === 0 && panorama.abiertas > 0)
      out.push({ tone: "win", icon: "check", title: "Vas al día", action: "Sin vencidas ni demoradas. 🎉 Mantén el control." });

    const order = { risk: 0, watch: 1, tip: 2, win: 3 };
    return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 6);
  }, [panorama, topShare, byClient, totalMin, topSlotProfile, weekendPct, trend]);

  const empty = !loading && inRange.length === 0;

  return (
    <div className="space-y-7">
      <SectionHeader
        title="Mi actividad"
        subtitle="Todo tu trabajo de un vistazo: tus tareas, tu carga, tus clientes y tu tiempo. Solo tú ves tu detalle."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Periodo */}
            <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm shadow-soft">
              {(["week", "month", "all"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3 py-1.5 font-medium transition focus-ring ${
                    range === r ? "bg-ink text-white" : "text-muted"
                  }`}
                >
                  {r === "week" ? "Semana" : r === "month" ? "Mes" : "Todo"}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Lo que te dice tu data — insights accionables para decidir mejor. */}
      {smartInsights.length > 0 && (
        <section className="reveal insights-reveal overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-accent/[0.06] to-transparent shadow-soft">
          <div className="flex items-center gap-2 px-6 pt-5">
            <Lightbulb size={18} className="text-accent" />
            <h2 className="font-display text-lg font-bold text-fg">Lo que te dice tu data</h2>
          </div>
          <p className="px-6 pb-4 pt-0.5 text-sm text-muted">Señales de tu semana y qué puedes hacer con ellas.</p>
          <div className="grid gap-px bg-line/60 sm:grid-cols-2">
            {smartInsights.map((ins, i) => <InsightCard key={i} {...ins} />)}
          </div>
        </section>
      )}

      {/* Panorama de MIS tareas — mucha data por persona, aunque no midan tiempo. */}
      {panorama.total > 0 && (
        <>
          <div className="reveal insights-reveal grid grid-cols-2 gap-4 lg:grid-cols-4">
            <PanoStat icon={<CheckSquare size={16} />} label="Tareas asignadas" value={panorama.total} />
            <PanoStat icon={<CalendarCheck size={16} />} label="Terminadas" value={panorama.done} tone="text-emerald-600" />
            <PanoStat icon={<Target size={16} />} label="Cumplimiento" value={panorama.completion} suffix="%" tone="text-accent" />
            <PanoStat icon={<Clock size={16} />} label="Horas registradas" value={panorama.totalSecs / 3600} decimals={1} suffix=" h" />
          </div>

          {/* Carga actual */}
          <section className="reveal insights-reveal rounded-2xl border border-line bg-surface p-6 shadow-soft">
            <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold text-fg"><CalendarRange size={20} /> Tu carga actual</h2>
            <p className="mb-5 text-sm text-muted">Lo que tienes abierto ahora mismo.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <LoadCell value={panorama.abiertas} label="Abiertas" tone="text-fg" />
              <LoadCell value={panorama.vencidas} label="Vencidas" tone={panorama.vencidas > 0 ? "text-rose-500" : "text-muted"} />
              <LoadCell value={panorama.porVencer} label="Vencen en 7 días" tone={panorama.porVencer > 0 ? "text-amber-600" : "text-muted"} />
              <LoadCell value={panorama.sinFecha} label="Sin fecha" tone="text-muted" />
            </div>
          </section>

          {/* Por estado — barra apilada + leyenda */}
          <section className="reveal insights-reveal rounded-2xl border border-line bg-surface p-6 shadow-soft">
            <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold text-fg"><CheckSquare size={20} /> Tus tareas por estado</h2>
            <p className="mb-5 text-sm text-muted">Cómo se reparte todo tu trabajo.</p>
            <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-surface-2">
              {panorama.byStatus.map((s) => (
                <div key={s.label} className={`h-full ${s.tone}`} style={{ width: `${(s.count / panorama.total) * 100}%` }} title={`${s.label}: ${s.count}`} />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {panorama.byStatus.map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.tone}`} />
                  {s.label} <span className="tabular font-semibold text-fg">{s.count}</span>
                </span>
              ))}
            </div>
          </section>

          {/* Por cliente + por tipo */}
          <div className="reveal insights-reveal grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold text-fg"><Building2 size={20} /> Por cliente</h2>
              <p className="mb-5 text-sm text-muted">Cuántas tareas y horas por cliente.</p>
              <div className="space-y-3">
                {panorama.byClient.slice(0, 7).map((c) => (
                  <div key={c.label} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-sm font-medium text-fg" title={c.label}>{c.label}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="curva-gradient h-full rounded-full" style={{ width: `${(c.count / panorama.clientMax) * 100}%` }} />
                    </div>
                    <span className="tabular w-16 shrink-0 text-right text-xs font-semibold text-fg">{c.count} {c.count === 1 ? "tarea" : "tareas"}</span>
                    <span className="tabular w-12 shrink-0 text-right text-[11px] text-muted">{c.secs > 0 ? formatHours(c.secs) : "—"}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold text-fg"><Sparkles size={20} /> Por tipo de trabajo</h2>
              <p className="mb-5 text-sm text-muted">Qué tipo de tareas haces más.</p>
              <div className="space-y-3">
                {panorama.byType.slice(0, 7).map((t) => (
                  <div key={t.label} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-sm font-medium text-fg" title={t.label}>{t.label}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(t.count / panorama.typeMax) * 100}%` }} />
                    </div>
                    <span className="tabular w-16 shrink-0 text-right text-xs font-semibold text-fg">{t.count}</span>
                  </div>
                ))}
              </div>
              {panorama.byWeight.some((w) => w.count > 0) && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Por esfuerzo</p>
                  <div className="flex gap-2">
                    {panorama.byWeight.map((w) => (
                      <div key={w.label} className="flex-1 rounded-xl bg-surface-2 px-2 py-2.5 text-center">
                        <p className="tabular font-display text-lg font-bold text-fg">{w.count}</p>
                        <p className="text-[11px] text-muted">{w.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {/* Tareas terminadas: cuánto le metiste a cada una (lo que Diana pedía). Vive
          aquí, no en el inicio. Solo las que tienen tiempo real; el resto se cuenta. */}
      {doneTasks.list.length > 0 && (
        <section className="reveal insights-reveal overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line px-6 py-4">
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <CheckSquare size={20} /> Tareas terminadas
              </h2>
              <p className="mt-0.5 text-sm text-muted">Cuánto tiempo le metiste a cada una.</p>
            </div>
            <div className="text-right">
              <p className="tabular font-display text-2xl font-bold text-fg">{formatDuration(doneTasks.timedTotalSec)}</p>
              <p className="text-xs text-muted">{doneTasks.total} terminadas{doneTasks.untimed > 0 ? ` · ${doneTasks.untimed} sin registro` : ""}</p>
            </div>
          </div>
          <ul className="divide-y divide-line/70">
            {doneTasks.list.map(({ task, secs }, i) => {
              const client = clientById[task.clientId];
              return (
                <li key={task.id} className="flex items-center gap-4 px-6 py-3">
                  <span className="tabular w-5 shrink-0 text-center text-sm font-bold text-muted/60">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{task.name}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 max-w-[220px] flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="curva-gradient h-full rounded-full" style={{ width: `${(secs / doneTasks.maxSec) * 100}%` }} />
                      </div>
                      {client && <span className="shrink-0 truncate text-[11px] text-muted">{client.name}</span>}
                    </div>
                  </div>
                  <span className="tabular shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-fg">{formatDuration(secs)}</span>
                </li>
              );
            })}
          </ul>
          {doneTasks.untimed > 0 && (
            <p className="border-t border-line px-6 py-3 text-xs text-muted">
              {doneTasks.untimed} tarea{doneTasks.untimed === 1 ? "" : "s"} más terminada{doneTasks.untimed === 1 ? "" : "s"} sin tiempo registrado (las cerraste sin medir con el cronómetro).
            </p>
          )}
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-16 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Cargando registros…
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
          Aún no mides tiempo con el cronómetro en este periodo. Cuando le des <span className="font-semibold text-fg">play</span> a tus tareas, aquí aparecerán tus tendencias, ritmo y franjas del día.
        </div>
      ) : (
        <>
          {/* KPIs con delta vs periodo anterior */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiDelta icon={<Clock size={16} />} label="Horas medidas" value={formatHours(totalMin * 60)} curr={totalMin} prev={prevTotalMin} />
            <KpiDelta icon={<CheckSquare size={16} />} label="Tareas trabajadas" value={String(distinctTasks)} curr={distinctTasks} prev={prevTasks} />
            <KpiDelta icon={<CalendarCheck size={16} />} label="Días activos" value={String(activeDays)} curr={activeDays} prev={prevDays} />
            <KpiDelta icon={<Clock size={16} />} label="Horas por tarea" value={formatHours((distinctTasks ? totalMin / distinctTasks : 0) * 60)} curr={distinctTasks ? totalMin / distinctTasks : 0} prev={prevTotalMin != null && prevTasks ? prevTotalMin / prevTasks : null} />
          </div>

          {/* Trabajo con IA */}
          {ai.hasAI && (
            <section className="overflow-hidden rounded-2xl border border-curva-indigo/30 bg-surface shadow-soft">
              <div className="flex items-center gap-2 border-b border-curva-indigo/15 bg-curva-indigo/5 px-6 py-4">
                <Sparkles size={20} className="text-curva-indigo" />
                <div>
                  <h2 className="font-display text-xl font-bold text-fg">Trabajo con IA</h2>
                  <p className="text-sm text-muted">Cuánto tiempo trabaja la IA por ti y si aprovechas la espera.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3">
                <div className="rounded-2xl border border-line p-5">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted"><Sparkles size={14} /> Tiempo en IA</p>
                  <p className="tabular mt-1 font-display text-2xl font-bold text-curva-indigo">{formatHours(ai.aiMin * 60)}</p>
                  <p className="mt-0.5 text-xs text-muted">{ai.share}% del tiempo total</p>
                </div>
                <div className="rounded-2xl border border-line p-5">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted"><Clock size={14} /> Tiempo manual</p>
                  <p className="tabular mt-1 font-display text-2xl font-bold text-fg">{formatHours(ai.manualMin * 60)}</p>
                  <p className="mt-0.5 text-xs text-muted">{100 - ai.share}% del tiempo total</p>
                </div>
                <div className="col-span-2 rounded-2xl border border-line p-5 sm:col-span-1">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted"><Target size={14} /> Aprovechamiento</p>
                  <p className="tabular mt-1 font-display text-2xl font-bold text-curva-teal">{ai.leverage}%</p>
                  <p className="mt-0.5 text-xs text-muted">de la espera usada en otra tarea</p>
                </div>
              </div>
              {/* Barra manual vs IA */}
              <div className="px-6 pb-6">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-ink" style={{ width: `${100 - ai.share}%` }} title={`Manual ${100 - ai.share}%`} />
                  <div className="h-full bg-curva-indigo" style={{ width: `${ai.share}%` }} title={`IA ${ai.share}%`} />
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-ink" /> Manual</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-curva-indigo" /> IA (espera)</span>
                </div>
              </div>
            </section>
          )}

          {/* Tendencia */}
          <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <TrendingUp size={20} /> Tendencia
              </h2>
              <div className="inline-flex rounded-full border border-line p-0.5 text-xs font-semibold">
                {([["weeks", "Semanas"], ["months", "Meses"]] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTrendMode(id)}
                    className={`rounded-full px-3 py-1 transition focus-ring ${
                      trendMode === id ? "bg-accent text-white" : "text-muted hover:text-fg"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mb-5 text-sm text-muted">
              {trendMode === "weeks" ? "Horas medidas por semana — últimas 8 semanas." : "Horas medidas por mes — últimos 6 meses."}
            </p>
            {(() => {
              const curve = smoothCurve(trendData.map((w) => w.minutes), trendMax);
              const lastPt = trendData.length ? ((trendData.length === 1 ? 50 : ((trendData.length - 1) / (trendData.length - 1)) * 100)) : 0;
              const lastVal = trendData[trendData.length - 1]?.minutes || 0;
              const lastY = 4 + 32 - (trendMax > 0 ? (lastVal / trendMax) * 32 : 0);
              return (
                <div>
                  <div className="relative">
                    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="block h-[130px] w-full overflow-visible">
                      <defs>
                        <linearGradient id="trendStroke" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="var(--curve-from)" />
                          <stop offset="55%" stopColor="var(--curve-via)" />
                          <stop offset="100%" stopColor="var(--curve-to)" />
                        </linearGradient>
                        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={curve.area} fill="url(#trendFill)" />
                      <path d={curve.line} fill="none" stroke="url(#trendStroke)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      {/* marcador del punto actual */}
                      <circle cx={lastPt} cy={lastY} r="2.4" fill="var(--surface)" stroke="var(--curve-to)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    </svg>
                  </div>
                  <div className="mt-2 flex justify-between">
                    {trendData.map((w, i) => (
                      <span key={i} className={`tabular text-[10px] ${i === trendData.length - 1 ? "font-bold text-fg" : "text-muted"}`}>{w.label}</span>
                    ))}
                  </div>
                  <p className="mt-1 text-right text-xs text-muted">Último: <span className="font-semibold text-fg">{formatHours(lastVal * 60)}</span></p>
                </div>
              );
            })()}
          </section>

          {/* Ritmo: día de la semana + franja del día */}
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <CalendarRange size={20} /> Días más productivos
              </h2>
              <p className="mb-5 text-sm text-muted">En qué día de la semana rinde más tu trabajo.</p>
              <div className="space-y-3">
                {byWeekday.map((min, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-4 text-sm font-semibold text-muted">{DIAS_CORTOS[i]}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(min / weekdayMax) * 100}%` }} />
                    </div>
                    <span className="tabular w-14 shrink-0 text-right text-xs font-medium text-muted">
                      {min > 0 ? formatHours(min * 60) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <Clock size={20} /> Franjas del día
              </h2>
              <p className="mb-5 text-sm text-muted">A qué hora se concentra el trabajo.</p>
              <div className="space-y-3">
                {bySlot.map((s) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="w-5 text-center text-sm" title={s.label}>{s.emoji}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="curva-gradient h-full rounded-full" style={{ width: `${(s.minutes / slotMax) * 100}%` }} />
                    </div>
                    <span className="tabular w-14 shrink-0 text-right text-xs font-medium text-muted">
                      {s.minutes > 0 ? formatHours(s.minutes * 60) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Por cliente: cuánto tiempo le has metido a cada uno */}
          {byClient.length > 0 && clientTotal > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <Building2 size={20} /> Tu tiempo por cliente
              </h2>
              <p className="mb-5 text-sm text-muted">Cuánto le has invertido a cada cliente en este periodo.</p>
              <div className="space-y-3">
                {byClient.map((c) => (
                  <div key={c.key} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-sm font-medium text-fg" title={c.label}>{c.label}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="curva-gradient h-full rounded-full" style={{ width: `${(c.minutes / clientMax) * 100}%` }} />
                    </div>
                    <span className="tabular w-20 shrink-0 text-right text-xs font-semibold text-fg">{formatDuration(c.minutes * 60)}</span>
                    <span className="tabular w-9 shrink-0 text-right text-[11px] text-muted">{Math.round((c.minutes / clientTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Historial: mis últimos registros */}
          {historial.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <CalendarRange size={20} /> Historial reciente
              </h2>
              <p className="mb-5 text-sm text-muted">Tus últimos registros de tiempo — qué hiciste y cuándo.</p>
              <ul className="divide-y divide-line/70">
                {historial.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">
                        {h.taskName}
                        {h.mode === "ai" && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-curva-indigo/10 px-1.5 py-0.5 text-[10px] font-semibold text-curva-indigo"><Sparkles size={9} /> IA</span>}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {h.when.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
                        {" · "}{h.when.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                        {h.client ? ` · ${h.client}` : ""}
                      </p>
                    </div>
                    <span className="tabular shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-fg">{formatDuration(h.minutes * 60)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Perfil del trabajador — solo lo ve la persona (anti-vigilancia) */}
          {me && (
                <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                      <UserRound size={20} /> Tu perfil de trabajo
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
                      <Lock size={11} /> Solo tú ves esto
                    </span>
                  </div>
                  <p className="mb-4 mt-1 text-sm text-muted">Lo que la data dice de cómo trabajas. El equipo solo ve totales agregados, nunca tu detalle.</p>
                  {totalMin === 0 ? (
                    <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">Mide un poco de tiempo y aquí verás tu perfil.</p>
                  ) : (
                    <ul className="space-y-2.5 text-sm text-fg">
                      {topSlotProfile && topSlotProfile.minutes > 0 && (
                        <Trait emoji={topSlotProfile.emoji}>Rindes más por la <b>{topSlotProfile.label.toLowerCase()}</b></Trait>
                      )}
                      <Trait emoji="📅">Tu día más productivo es el <b>{DIAS_LARGOS[topWeekdayIdx]}</b></Trait>
                      <Trait emoji={weekendPct > 0 ? "🌱" : "🛋️"}>
                        {weekendPct > 0 ? <>Trabajas <b>{weekendPct}%</b> en fin de semana</> : <>Respetas tus fines de semana</>}
                      </Trait>
                      {byClient[0] && byClient[0].minutes > 0 && byClient[0].label !== "Sin cliente" && (
                        <Trait emoji="🎯">Te concentras en <b>{byClient[0].label}</b> ({topShare}% de tu tiempo)</Trait>
                      )}
                    </ul>
                  )}
                </section>
          )}
        </>
      )}
    </div>
  );
}

// KPI con flecha de delta vs periodo anterior.
function KpiDelta({
  icon,
  label,
  value,
  curr,
  prev,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  curr: number;
  prev: number | null;
}) {
  let delta: { up: boolean; text: string } | null = null;
  if (prev !== null && prev > 0) {
    const p = Math.round(((curr - prev) / prev) * 100);
    if (p !== 0) delta = { up: p > 0, text: `${Math.abs(p)}%` };
  } else if (prev === 0 && curr > 0) {
    delta = { up: true, text: "nuevo" };
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">{icon}{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="tabular font-display text-2xl font-bold text-fg">{value}</p>
        {delta && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${delta.up ? "text-emerald-600" : "text-muted"}`}>
            {delta.up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}

// Tarjeta de insight accionable: hallazgo (título) + qué hacer (acción), con tono.
function InsightCard({ tone, icon, title, action, href }: { tone: "risk" | "watch" | "tip" | "win"; icon: string; title: string; action: string; href?: string }) {
  const TONE: Record<string, { chip: string; ring: string }> = {
    risk: { chip: "bg-rose-500/10 text-rose-500", ring: "text-rose-500" },
    watch: { chip: "bg-amber-500/10 text-amber-600", ring: "text-amber-600" },
    tip: { chip: "bg-accent/10 text-accent", ring: "text-accent" },
    win: { chip: "bg-emerald-500/10 text-emerald-600", ring: "text-emerald-600" },
  };
  const ICONS: Record<string, typeof AlertTriangle> = {
    alert: AlertTriangle, clock: Clock, zap: Zap, building: Building2,
    trend: TrendingUp, sun: Sun, target: Target, check: CircleCheck,
  };
  const Icon = ICONS[icon] || Lightbulb;
  const t = TONE[tone];
  const inner = (
    <>
      <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.chip}`}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg">{title}{href && <ArrowRight size={12} className="ml-1 inline opacity-50" />}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{action}</p>
      </div>
    </>
  );
  if (href) {
    return <Link href={href} className="flex items-start gap-3 bg-surface px-6 py-4 transition hover:bg-surface-2">{inner}</Link>;
  }
  return <div className="flex items-start gap-3 bg-surface px-6 py-4">{inner}</div>;
}

// KPI simple del panorama (sin delta), con número que cuenta al entrar.
function PanoStat({ icon, label, value, decimals = 0, suffix = "", tone = "text-fg" }: { icon: React.ReactNode; label: string; value: number; decimals?: number; suffix?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">{icon}{label}</p>
      <p className={`tabular mt-1 font-display text-2xl font-bold ${tone}`}><CountUp value={value} decimals={decimals} suffix={suffix} /></p>
    </div>
  );
}

// Celda de "carga actual".
function LoadCell({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 px-3 py-4 text-center">
      <p className={`tabular font-display text-2xl font-bold leading-none ${tone}`}><CountUp value={value} /></p>
      <p className="mt-1.5 text-[11px] font-medium text-muted">{label}</p>
    </div>
  );
}

function Trait({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="text-base leading-5">{emoji}</span>
      <span>{children}</span>
    </li>
  );
}

