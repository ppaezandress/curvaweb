"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  CheckSquare,
  Users,
  Play,
  TrendingUp,
  CalendarRange,
  Building2,
  Sparkles,
  Trophy,
  Sunrise,
  Moon,
  Flame,
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
import { formatHours } from "@/lib/format";
import { computeStreak, dayKey } from "@/lib/streaks";
import { mondayOf, DIAS_CORTOS } from "@/lib/date";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Avatar } from "@/components/Avatar";
import type { Member } from "@/lib/mock-data";

type Rec = { id: string; taskId: string; person: string; start: string; minutes: number; mode?: "manual" | "ai" };
type Range = "week" | "month" | "all";
type Lens = "team" | "me";

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

export default function InsightsPage() {
  const { taskById, projectById, clientById, members, memberById } = useData();
  const { currentUserId } = useApp();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("month");
  const [lens, setLens] = useState<Lens>("team");

  useEffect(() => {
    fetch("/api/time-entries")
      .then((r) => r.json())
      .then((d) => setRecords(d.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const memberByName = useMemo<Record<string, Member>>(
    () => Object.fromEntries(members.map((m) => [m.name, m])),
    [members],
  );

  // Lente: en "yo" filtramos a los registros de la persona logueada.
  const mine = useMemo(() => {
    if (lens === "me" && me) return records.filter((r) => r.person === me.name);
    return records;
  }, [records, lens, me]);

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
  const sessions = inRange.length;

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
  const prevSessions = prevRows?.length ?? null;
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
  const trendMax = Math.max(...trend.map((w) => w.minutes), 1);

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
  const byClient = useMemo(() => {
    const m = new Map<string, { label: string; minutes: number }>();
    inRange.forEach((r) => {
      const task = taskById[r.taskId];
      const project = task ? projectById[task.projectId] : undefined;
      const client = project ? clientById[project.clientId] : undefined;
      const key = client?.id || "—";
      const label = client?.name || "Sin cliente";
      if (!m.has(key)) m.set(key, { label, minutes: 0 });
      m.get(key)!.minutes += r.minutes;
    });
    return [...m.values()].sort((a, b) => b.minutes - a.minutes);
  }, [inRange, taskById, projectById, clientById]);
  const clientTotal = byClient.reduce((a, c) => a + c.minutes, 0);
  const topShare = clientTotal > 0 ? Math.round((byClient[0].minutes / clientTotal) * 100) : 0;

  // Perfil personal (lente "yo"): rasgos derivados de tu propia data.
  const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const weekendMin = useMemo(
    () => inRange.filter((r) => { const g = new Date(r.start).getDay(); return g === 0 || g === 6; }).reduce((a, r) => a + r.minutes, 0),
    [inRange],
  );
  const weekendPct = totalMin > 0 ? Math.round((weekendMin / totalMin) * 100) : 0;
  const topWeekdayIdx = byWeekday.reduce((best, m, i, arr) => (m > arr[best] ? i : best), 0);
  const topSlotProfile = [...bySlot].sort((a, b) => b.minutes - a.minutes)[0];

  // ---- Superlativos / Wrapped (por persona, en rango) ----
  type Stat = {
    name: string;
    minutes: number;
    tasks: number;
    days: number;
    avgStart: number; // hora promedio de inicio
    longest: number; // racha histórica
  };
  const perPerson = useMemo<Stat[]>(() => {
    const acc = new Map<
      string,
      { minutes: number; tasks: Set<string>; days: Set<string>; hSum: number; n: number }
    >();
    inRange.forEach((r) => {
      if (!acc.has(r.person))
        acc.set(r.person, { minutes: 0, tasks: new Set(), days: new Set(), hSum: 0, n: 0 });
      const a = acc.get(r.person)!;
      const d = new Date(r.start);
      a.minutes += r.minutes;
      a.tasks.add(r.taskId);
      a.days.add(dayKey(d.getTime()));
      a.hSum += d.getHours() + d.getMinutes() / 60;
      a.n += 1;
    });
    return [...acc.entries()].map(([name, a]) => {
      // Racha histórica: días de actividad de la persona en TODO el historial.
      const daySet = new Set<string>();
      records
        .filter((r) => r.person === name)
        .forEach((r) => daySet.add(dayKey(new Date(r.start).getTime())));
      return {
        name,
        minutes: a.minutes,
        tasks: a.tasks.size,
        days: a.days.size,
        avgStart: a.n ? a.hSum / a.n : 0,
        longest: computeStreak(daySet).longest,
      };
    });
  }, [inRange, records]);

  const winner = (pick: (s: Stat) => number, dir: "max" | "min" = "max") => {
    if (perPerson.length === 0) return null;
    const sorted = [...perPerson].sort((a, b) => (dir === "max" ? pick(b) - pick(a) : pick(a) - pick(b)));
    const top = sorted[0];
    return pick(top) > 0 || dir === "min" ? top : null;
  };

  const empty = !loading && inRange.length === 0;

  return (
    <div className="space-y-7">
      <SectionHeader
        title="Insights"
        subtitle="Cómo trabaja CURVA: tendencias, ritmo y los logros del equipo."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Lente: equipo / yo */}
            <div className="inline-flex rounded-full border border-line bg-white p-0.5 text-sm shadow-soft">
              {(["team", "me"] as Lens[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLens(l)}
                  disabled={l === "me" && !me}
                  className={`rounded-full px-3 py-1.5 font-medium transition focus-ring disabled:opacity-40 ${
                    lens === l ? "bg-curva-purple text-white" : "text-zinc-500"
                  }`}
                >
                  {l === "team" ? "Equipo" : "Yo"}
                </button>
              ))}
            </div>
            {/* Periodo */}
            <div className="inline-flex rounded-full border border-line bg-white p-0.5 text-sm shadow-soft">
              {(["week", "month", "all"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3 py-1.5 font-medium transition focus-ring ${
                    range === r ? "bg-ink text-white" : "text-zinc-500"
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
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-white py-16 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" /> Cargando registros…
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-zinc-400">
          No hay registros en este rango. Dale play a una tarea para empezar a medir.
        </div>
      ) : (
        <>
          {/* KPIs con delta vs periodo anterior */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiDelta icon={<Clock size={16} />} label="Horas medidas" value={formatHours(totalMin * 60)} curr={totalMin} prev={prevTotalMin} />
            <KpiDelta icon={<CheckSquare size={16} />} label="Tareas trabajadas" value={String(distinctTasks)} curr={distinctTasks} prev={prevTasks} />
            {lens === "team" ? (
              <KpiDelta icon={<Users size={16} />} label="Personas activas" value={String(distinctPeople)} curr={distinctPeople} prev={null} />
            ) : (
              <KpiDelta icon={<CalendarCheck size={16} />} label="Días activos" value={String(activeDays)} curr={activeDays} prev={prevDays} />
            )}
            <KpiDelta icon={<Play size={16} />} label="Sesiones" value={String(sessions)} curr={sessions} prev={prevSessions} />
          </div>

          {/* Trabajo con IA */}
          {ai.hasAI && (
            <section className="overflow-hidden rounded-2xl border border-curva-indigo/30 bg-white shadow-soft">
              <div className="flex items-center gap-2 border-b border-curva-indigo/15 bg-curva-indigo/5 px-6 py-4">
                <Sparkles size={20} className="text-curva-indigo" />
                <div>
                  <h2 className="font-display text-xl font-bold text-ink">Trabajo con IA</h2>
                  <p className="text-sm text-zinc-500">Cuánto tiempo trabaja la IA por ti y si aprovechas la espera.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3">
                <div className="rounded-2xl border border-line p-5">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-400"><Sparkles size={14} /> Tiempo en IA</p>
                  <p className="tabular mt-1 font-display text-2xl font-bold text-curva-indigo">{formatHours(ai.aiMin * 60)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{ai.share}% del tiempo total</p>
                </div>
                <div className="rounded-2xl border border-line p-5">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-400"><Clock size={14} /> Tiempo manual</p>
                  <p className="tabular mt-1 font-display text-2xl font-bold text-ink">{formatHours(ai.manualMin * 60)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{100 - ai.share}% del tiempo total</p>
                </div>
                <div className="col-span-2 rounded-2xl border border-line p-5 sm:col-span-1">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-400"><Target size={14} /> Aprovechamiento</p>
                  <p className="tabular mt-1 font-display text-2xl font-bold text-curva-teal">{ai.leverage}%</p>
                  <p className="mt-0.5 text-xs text-zinc-500">de la espera usada en otra tarea</p>
                </div>
              </div>
              {/* Barra manual vs IA */}
              <div className="px-6 pb-6">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full bg-ink" style={{ width: `${100 - ai.share}%` }} title={`Manual ${100 - ai.share}%`} />
                  <div className="h-full bg-curva-indigo" style={{ width: `${ai.share}%` }} title={`IA ${ai.share}%`} />
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-ink" /> Manual</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-curva-indigo" /> IA (espera)</span>
                </div>
              </div>
            </section>
          )}

          {/* Tendencia */}
          <section className="rounded-2xl border border-line bg-white p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
              <TrendingUp size={20} /> Tendencia
            </h2>
            <p className="mb-5 text-sm text-zinc-500">Horas medidas por semana — últimas 8 semanas.</p>
            <div className="flex items-end justify-between gap-2" style={{ height: 160 }}>
              {trend.map((w, i) => {
                const h = Math.round((w.minutes / trendMax) * 130);
                const last = i === trend.length - 1;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="tabular text-[10px] font-semibold text-zinc-400">
                      {w.minutes > 0 ? formatHours(w.minutes * 60) : ""}
                    </span>
                    <div
                      className={`w-full rounded-t-lg transition-all ${last ? "curva-gradient" : "bg-curva-purple/30"}`}
                      style={{ height: Math.max(h, w.minutes > 0 ? 4 : 0) }}
                      title={`${w.label}: ${formatHours(w.minutes * 60)}`}
                    />
                    <span className="tabular text-[10px] text-zinc-400">{w.label}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Ritmo: día de la semana + franja del día */}
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-line bg-white p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
                <CalendarRange size={20} /> Días más productivos
              </h2>
              <p className="mb-5 text-sm text-zinc-500">En qué día de la semana rinde más {lens === "me" ? "tu trabajo" : "el equipo"}.</p>
              <div className="space-y-3">
                {byWeekday.map((min, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-4 text-sm font-semibold text-zinc-500">{DIAS_CORTOS[i]}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-curva-purple" style={{ width: `${(min / weekdayMax) * 100}%` }} />
                    </div>
                    <span className="tabular w-14 shrink-0 text-right text-xs font-medium text-zinc-500">
                      {min > 0 ? formatHours(min * 60) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-white p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
                <Clock size={20} /> Franjas del día
              </h2>
              <p className="mb-5 text-sm text-zinc-500">A qué hora se concentra el trabajo.</p>
              <div className="space-y-3">
                {bySlot.map((s) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="w-5 text-center text-sm" title={s.label}>{s.emoji}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div className="curva-gradient h-full rounded-full" style={{ width: `${(s.minutes / slotMax) * 100}%` }} />
                    </div>
                    <span className="tabular w-14 shrink-0 text-right text-xs font-medium text-zinc-500">
                      {s.minutes > 0 ? formatHours(s.minutes * 60) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Concentración de clientes */}
          {lens === "team" && clientTotal > 0 && (
            <section className="rounded-2xl border border-line bg-white p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
                <Building2 size={20} /> Concentración de clientes
              </h2>
              <p className="mb-5 text-sm text-zinc-500">
                <span className="font-semibold text-ink">{byClient[0].label}</span> concentra el{" "}
                <span className="font-semibold text-curva-purple">{topShare}%</span> del tiempo.
                {topShare >= 50 && " Vale la pena diversificar la cartera."}
              </p>
              <div className="space-y-4">
                {byClient.map((c) => {
                  const share = Math.round((c.minutes / clientTotal) * 100);
                  return (
                    <div key={c.label}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-semibold text-ink">{c.label}</span>
                        <span className="tabular shrink-0 text-zinc-500">
                          <span className="font-semibold text-ink">{formatHours(c.minutes * 60)}</span>
                          <span className="ml-2 text-zinc-400">{share}%</span>
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-curva-purple" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Wrapped / Superlativos */}
          {lens === "team" ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
              <div className="curva-gradient px-6 py-5">
                <h2 className="flex items-center gap-2 font-display text-xl font-bold text-white">
                  <Sparkles size={20} /> CURVA Wrapped
                </h2>
                <p className="text-sm text-white/80">Los superlativos del equipo en este periodo.</p>
              </div>
              <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
                <Superlative icon={<Trophy size={18} />} title="Más horas" stat={winner((s) => s.minutes)} member={memberByName} value={(s) => formatHours(s.minutes * 60)} />
                <Superlative icon={<Target size={18} />} title="Más tareas" stat={winner((s) => s.tasks)} member={memberByName} value={(s) => `${s.tasks} tareas`} />
                <Superlative icon={<CalendarCheck size={18} />} title="Más constante" stat={winner((s) => s.days)} member={memberByName} value={(s) => `${s.days} días`} />
                <Superlative icon={<Flame size={18} />} title="Racha más larga" stat={winner((s) => s.longest)} member={memberByName} value={(s) => `${s.longest} días`} />
                <Superlative icon={<Sunrise size={18} />} title="Más madrugador" stat={winner((s) => s.avgStart, "min")} member={memberByName} value={(s) => `~${Math.round(s.avgStart)}:00`} />
                <Superlative icon={<Moon size={18} />} title="Búho nocturno" stat={winner((s) => s.avgStart)} member={memberByName} value={(s) => `~${Math.round(s.avgStart)}:00`} />
              </div>
            </section>
          ) : (
            me && (
              <>
                <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
                  <div className="curva-gradient px-6 py-5">
                    <h2 className="flex items-center gap-2 font-display text-xl font-bold text-white">
                      <Sparkles size={20} /> Tu Wrapped
                    </h2>
                    <p className="text-sm text-white/80">Tus números en este periodo.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
                    <MiniStat label="Horas" value={formatHours(totalMin * 60)} />
                    <MiniStat label="Tareas" value={String(distinctTasks)} />
                    <MiniStat label="Días activos" value={String(activeDays)} />
                    <MiniStat
                      label="Tu franja"
                      value={topSlotProfile && topSlotProfile.minutes > 0 ? `${topSlotProfile.emoji} ${topSlotProfile.label}` : "—"}
                    />
                  </div>
                </section>

                {/* Perfil del trabajador — solo lo ve la persona (anti-vigilancia) */}
                <section className="rounded-2xl border border-line bg-white p-6 shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
                      <UserRound size={20} /> Tu perfil de trabajo
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-500">
                      <Lock size={11} /> Solo tú ves esto
                    </span>
                  </div>
                  <p className="mb-4 mt-1 text-sm text-zinc-500">Lo que la data dice de cómo trabajas. El equipo solo ve totales agregados, nunca tu detalle.</p>
                  {totalMin === 0 ? (
                    <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-zinc-400">Mide un poco de tiempo y aquí verás tu perfil.</p>
                  ) : (
                    <ul className="space-y-2.5 text-sm text-ink">
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
              </>
            )
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
    <div className="rounded-2xl border border-line bg-white p-5 shadow-soft">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-400">{icon}{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="tabular font-display text-2xl font-bold text-ink">{value}</p>
        {delta && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${delta.up ? "text-emerald-600" : "text-zinc-400"}`}>
            {delta.up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}

type Stat = { name: string; minutes: number; tasks: number; days: number; avgStart: number; longest: number };

function Superlative({
  icon,
  title,
  stat,
  member,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  stat: Stat | null;
  member: Record<string, Member>;
  value: (s: Stat) => string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-curva-purple/10 text-curva-purple">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</p>
        {stat ? (
          <div className="mt-0.5 flex items-center gap-2">
            <Avatar member={member[stat.name]} name={stat.name} size={22} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{stat.name}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-curva-purple">{value(stat)}</span>
          </div>
        ) : (
          <p className="mt-0.5 text-sm text-zinc-400">—</p>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-zinc-50/50 p-4 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="tabular mt-1 font-display text-xl font-bold text-ink">{value}</p>
    </div>
  );
}
