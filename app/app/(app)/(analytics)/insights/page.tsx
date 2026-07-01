"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
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
} from "lucide-react";
import { useData } from "@/lib/data-context";
import { useApp } from "@/lib/app-context";
import { formatHours, formatDuration } from "@/lib/format";
import { dayKey } from "@/lib/streaks";
import { mondayOf, firstDayOfMonth, monthShort, DIAS_CORTOS } from "@/lib/date";
import { SectionHeader } from "@/components/ui/SectionHeader";

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
  const { taskById, projectById, clientById, memberById } = useData();
  const { currentUserId } = useApp();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("month");
  const [trendMode, setTrendMode] = useState<"weeks" | "months">("weeks");

  useEffect(() => {
    fetch("/api/time-entries")
      .then((r) => r.json())
      .then((d) => setRecords(d.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);


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

  const empty = !loading && inRange.length === 0;

  return (
    <div className="space-y-7">
      <SectionHeader
        title="Mi tiempo"
        subtitle="Tu tiempo: tus tendencias, tu ritmo y tu perfil. Solo tú ves tu detalle."
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

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-16 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Cargando registros…
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">
          No hay registros en este rango. Dale play a una tarea para empezar a medir.
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

function Trait({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="text-base leading-5">{emoji}</span>
      <span>{children}</span>
    </li>
  );
}

