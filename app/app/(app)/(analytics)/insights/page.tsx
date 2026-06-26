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
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { formatHours } from "@/lib/format";
import { computeStreak, dayKey } from "@/lib/streaks";
import { mondayOf, firstDayOfMonth, monthShort, DIAS_CORTOS } from "@/lib/date";
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
  const { taskById, projectById, clientById, members, memberById } = useData();
  const { currentUserId } = useApp();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("month");
  const [lens, setLens] = useState<Lens>("team");
  const [trendMode, setTrendMode] = useState<"weeks" | "months">("weeks");
  const [selClient, setSelClient] = useState<string | null>(null);
  const [cowork, setCowork] = useState<{ uid: string; name: string; avatarUrl: string | null; minutes: number; sessions: number }[]>([]);

  useEffect(() => {
    fetch("/api/time-entries")
      .then((r) => r.json())
      .then((d) => setRecords(d.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  // Co-working del mes (RLS solo devuelve TUS sesiones); agregado por compañero.
  useEffect(() => {
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      const { data: u } = await sb.auth.getUser();
      const myUid = u.user?.id;
      if (!myUid) return;
      const monthStart = firstDayOfMonth(new Date()).toISOString();
      const [{ data: sess }, { data: profs }] = await Promise.all([
        sb.from("coworking_sessions").select("user_a,user_b,minutes,created_at").gte("created_at", monthStart),
        sb.from("profiles").select("id,name,avatar_url"),
      ]);
      const pmap: Record<string, { name: string; avatar_url: string | null }> = {};
      (profs || []).forEach((p: { id: string; name: string; avatar_url: string | null }) => (pmap[p.id] = p));
      const agg = new Map<string, { minutes: number; sessions: number }>();
      (sess || []).forEach((s: { user_a: string; user_b: string; minutes: number }) => {
        const other = s.user_a === myUid ? s.user_b : s.user_a;
        const cur = agg.get(other) || { minutes: 0, sessions: 0 };
        cur.minutes += s.minutes; cur.sessions += 1;
        agg.set(other, cur);
      });
      const list = [...agg.entries()]
        .map(([uid, v]) => ({ uid, name: pmap[uid]?.name || "Compañero", avatarUrl: pmap[uid]?.avatar_url || null, ...v }))
        .sort((a, b) => b.minutes - a.minutes);
      setCowork(list);
    })();
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

  // Drill-down del cliente seleccionado: su tendencia por semana (6) + top tareas.
  const clientDrill = useMemo(() => {
    if (!selClient) return null;
    const recs = inRange.filter((r) => clientKeyOf(r).key === selClient);
    const wkStart = mondayOf(new Date());
    const weeks: { label: string; minutes: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const s = new Date(wkStart); s.setDate(s.getDate() - i * 7);
      const e = new Date(s); e.setDate(e.getDate() + 7);
      const minutes = recs.filter((r) => { const t = r.start ? new Date(r.start).getTime() : 0; return t >= s.getTime() && t < e.getTime(); }).reduce((a, r) => a + r.minutes, 0);
      weeks.push({ label: `${s.getDate()}/${s.getMonth() + 1}`, minutes });
    }
    const byTask = new Map<string, { name: string; minutes: number }>();
    recs.forEach((r) => { const t = taskById[r.taskId]; const k = r.taskId || r.id; if (!byTask.has(k)) byTask.set(k, { name: t?.name || "(externa)", minutes: 0 }); byTask.get(k)!.minutes += r.minutes; });
    const topTasks = [...byTask.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 5);
    return { weeks, topTasks };
  }, [selClient, inRange, taskById, projectById, clientById]);

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
            <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm shadow-soft">
              {(["team", "me"] as Lens[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLens(l)}
                  disabled={l === "me" && !me}
                  className={`rounded-full px-3 py-1.5 font-medium transition focus-ring disabled:opacity-40 ${
                    lens === l ? "bg-accent text-white" : "text-muted"
                  }`}
                >
                  {l === "team" ? "Equipo" : "Yo"}
                </button>
              ))}
            </div>
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
            {lens === "team" ? (
              <KpiDelta icon={<Users size={16} />} label="Personas activas" value={String(distinctPeople)} curr={distinctPeople} prev={null} />
            ) : (
              <KpiDelta icon={<CalendarCheck size={16} />} label="Días activos" value={String(activeDays)} curr={activeDays} prev={prevDays} />
            )}
            <KpiDelta icon={<Play size={16} />} label="Sesiones" value={String(sessions)} curr={sessions} prev={prevSessions} />
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

          {/* Trabajo en equipo (co-working): horas compartidas por compañero, este mes.
              Es tu data (RLS); separado de los totales de Notion para no insinuar doble conteo. */}
          {cowork.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <Users size={20} /> Trabajo en equipo
              </h2>
              <p className="mb-5 text-sm text-muted">Tiempo que trabajaste la misma tarea, a la vez, con cada quién — este mes.</p>
              <div className="space-y-3">
                {cowork.map((c) => {
                  const max = Math.max(...cowork.map((x) => x.minutes), 1);
                  return (
                    <div key={c.uid} className="flex items-center gap-3">
                      <Avatar name={c.name} src={c.avatarUrl} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-fg">{c.name}</span>
                          <span className="tabular shrink-0 text-xs text-muted">{formatHours(c.minutes * 60)} · {c.sessions} {c.sessions === 1 ? "sesión" : "sesiones"}</span>
                        </div>
                        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-curva-teal" style={{ width: `${(c.minutes / max) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Ritmo: día de la semana + franja del día */}
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <CalendarRange size={20} /> Días más productivos
              </h2>
              <p className="mb-5 text-sm text-muted">En qué día de la semana rinde más {lens === "me" ? "tu trabajo" : "el equipo"}.</p>
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

          {/* Concentración de clientes */}
          {lens === "team" && clientTotal > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <Building2 size={20} /> Concentración de clientes
              </h2>
              <p className="mb-5 text-sm text-muted">
                <span className="font-semibold text-fg">{byClient[0].label}</span> concentra el{" "}
                <span className="font-semibold text-accent">{topShare}%</span> del tiempo.
                {topShare >= 50 && " Vale la pena diversificar la cartera."}
              </p>
              <p className="mb-3 -mt-3 text-xs text-muted">Pica un cliente para ver su tendencia y en qué tareas se va.</p>
              <div className="space-y-2">
                {byClient.map((c) => {
                  const share = Math.round((c.minutes / clientTotal) * 100);
                  const on = selClient === c.key;
                  const wkMax = clientDrill ? Math.max(...clientDrill.weeks.map((w) => w.minutes), 1) : 1;
                  return (
                    <div key={c.key} className={`rounded-xl transition ${on ? "bg-surface-2 p-3" : ""}`}>
                      <button onClick={() => setSelClient(on ? null : c.key)} className="w-full text-left focus-ring rounded-lg">
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                          <span className={`truncate font-semibold ${on ? "text-accent" : "text-fg"}`}>{c.label}</span>
                          <span className="tabular shrink-0 text-muted">
                            <span className="font-semibold text-fg">{formatHours(c.minutes * 60)}</span>
                            <span className="ml-2 text-muted">{share}%</span>
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                          <div className={`h-full rounded-full ${on ? "curva-gradient" : "bg-accent"}`} style={{ width: `${share}%` }} />
                        </div>
                      </button>
                      {on && clientDrill && (
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          {/* Tendencia 6 semanas */}
                          <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Últimas 6 semanas</p>
                            <div className="flex items-end justify-between gap-1.5" style={{ height: 64 }}>
                              {clientDrill.weeks.map((w, i) => (
                                <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                                  <div className={`w-full rounded-t ${i === clientDrill.weeks.length - 1 ? "curva-gradient" : "bg-accent/30"}`} style={{ height: Math.max(Math.round((w.minutes / wkMax) * 52), w.minutes > 0 ? 3 : 0) }} title={`${w.label}: ${formatHours(w.minutes * 60)}`} />
                                  <span className="text-[9px] text-muted">{w.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Top tareas */}
                          <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">En qué se va</p>
                            <div className="space-y-1">
                              {clientDrill.topTasks.map((t, i) => (
                                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="truncate text-fg">{t.name}</span>
                                  <span className="tabular shrink-0 text-muted">{formatHours(t.minutes * 60)}</span>
                                </div>
                              ))}
                              {clientDrill.topTasks.length === 0 && <p className="text-xs text-muted">Sin detalle.</p>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Wrapped / Superlativos */}
          {lens === "team" ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
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
                <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
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
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
        {stat ? (
          <div className="mt-0.5 flex items-center gap-2">
            <Avatar member={member[stat.name]} name={stat.name} size={22} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{stat.name}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-accent">{value(stat)}</span>
          </div>
        ) : (
          <p className="mt-0.5 text-sm text-muted">—</p>
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
    <div className="rounded-2xl border border-line bg-surface-2/50 p-4 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="tabular mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}
