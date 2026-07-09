"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Clock, ListChecks, CalendarCheck, Gauge, TrendingUp, CalendarDays, ArrowRight } from "lucide-react";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { useTimeRecords } from "@/lib/use-time-records";
import { DateRangeProvider, useDateRange } from "@/lib/range-context";
import { granularityFor, prevOf } from "@/lib/range";
import { bucketize, type GroupBy, type EntityMaps } from "@/lib/timeseries";
import { computePulse, PULSE_LABELS, type PulseComponents } from "@/lib/pulse";
import { analyzeDay } from "@/lib/day-analytics";
import { isDone, isAssignedTo } from "@/lib/task-status";
import { dayKey } from "@/lib/streaks";
import { formatHours, formatDuration } from "@/lib/format";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { RangePicker } from "@/components/ui/RangePicker";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Chart } from "@/components/ui/Chart";
import { Bars } from "@/components/analytics/Bars";
import { Stat, toDelta } from "@/components/ui/Stat";
import { Meter } from "@/components/ui/Meter";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AnalisisPage() {
  return (
    <DateRangeProvider defaultPreset="30d">
      <Analisis />
    </DateRangeProvider>
  );
}

type Summary = { min: number; tasks: number; days: number; perDay: number };

function summarize(recs: { taskId: string; start: string; minutes: number }[]): Summary {
  let min = 0;
  const t = new Set<string>();
  const d = new Set<string>();
  for (const r of recs) {
    min += r.minutes || 0;
    if (r.taskId) t.add(r.taskId);
    const ms = new Date(r.start).getTime();
    if (!isNaN(ms)) d.add(dayKey(ms));
  }
  return { min, tasks: t.size, days: d.size, perDay: d.size ? min / d.size : 0 };
}

const GROUPS: { key: GroupBy; label: string }[] = [
  { key: "none", label: "Total" },
  { key: "area", label: "Por área" },
  { key: "project", label: "Por proyecto" },
  { key: "client", label: "Por cliente" },
];

function Analisis() {
  const { currentUserId, entries } = useApp();
  const { tasks, taskById, taskTypeById, projectById, clientById, memberById, recentEntries } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const { records, loading } = useTimeRecords();

  // Resumen de HOY para el acceso al análisis del día (mismas fuentes que el dashboard).
  const today = useMemo(() => analyzeDay(
    { records, recentEntries, entries, myName: (me?.name || "").trim(), dayStart: new Date().setHours(0, 0, 0, 0), now: Date.now(), priorRecords: records, priorDays: 30 },
    { taskById, projectById, clientById, taskTypeById },
  ), [records, recentEntries, entries, me, taskById, projectById, clientById, taskTypeById]);
  const { range } = useDateRange();
  const [groupBy, setGroupBy] = useState<GroupBy>("area");

  const maps: EntityMaps = { taskById, taskTypeById, projectById, clientById };
  const mine = useMemo(() => tasks.filter((t) => isAssignedTo(t, currentUserId)), [tasks, currentUserId]);
  const myRecords = useMemo(
    () => records.filter((r) => (r.person || "").trim() === (me?.name || "").trim()),
    [records, me],
  );

  // Pulso (siempre semanal, independiente del rango).
  const pulse = useMemo(() => computePulse(myRecords, mine), [myRecords, mine]);

  // Registros dentro del rango (y del rango anterior, para deltas).
  const inRange = useMemo(
    () => myRecords.filter((r) => { const ms = new Date(r.start).getTime(); return ms >= range.from && ms <= range.to; }),
    [myRecords, range],
  );
  const prev = prevOf(range);
  const inPrev = useMemo(
    () => (prev ? myRecords.filter((r) => { const ms = new Date(r.start).getTime(); return ms >= prev.from && ms <= prev.to; }) : []),
    [myRecords, prev],
  );
  const cur = useMemo(() => summarize(inRange), [inRange]);
  const prv = useMemo(() => (prev ? summarize(inPrev) : null), [prev, inPrev]);

  // Serie temporal (la estrella): avance en el tiempo, agrupable.
  const gran = granularityFor(range);
  const ts = useMemo(
    () => bucketize(myRecords, { from: range.from, to: range.to, granularity: gran, groupBy, maps }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myRecords, range, gran, groupBy, taskById, taskTypeById, projectById, clientById],
  );

  // Desgloses por área / cliente (totales del rango).
  const byArea = useMemo(
    () => bucketize(myRecords, { from: range.from, to: range.to, granularity: "month", groupBy: "area", maps }).series,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myRecords, range, taskById, taskTypeById],
  );
  const byClient = useMemo(
    () => bucketize(myRecords, { from: range.from, to: range.to, granularity: "month", groupBy: "client", maps }).series,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myRecords, range, taskById, projectById, clientById],
  );

  // Serie total (para el sparkline del KPI de horas).
  const totalSpark = useMemo(
    () => bucketize(myRecords, { from: range.from, to: range.to, granularity: gran, groupBy: "none", maps }).series[0]?.values ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myRecords, range, gran, taskById],
  );

  const granLabel = gran === "day" ? "por día" : gran === "week" ? "por semana" : "por mes";
  const empty = !loading && cur.min === 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Análisis"
        subtitle="Tu trabajo con profundidad: cómo avanzas en el tiempo, por área y por cliente. Solo tú ves tu detalle."
        action={<RangePicker />}
      />

      {/* Acceso al análisis del día (vista hermana, día a día). Al entrar a Análisis
          aparece "luego luego" con el resumen de HOY para poder meterse ahí directo. */}
      <Link
        href="/dia"
        className="focus-ring group block rounded-card border border-accent/30 bg-accent/5 p-5 transition hover:border-accent hover:bg-accent/10"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-accent/10 text-accent"><CalendarDays size={18} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-fg">Tu día · hoy</span>
              <span className="block truncate text-caption text-muted">Horarios, foco, proyectos y ritmo — hoy o cualquier día pasado</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-caption font-medium text-accent">
            Abrir <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
          </span>
        </div>
        {today.total > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-accent/15 pt-4">
            <DayStat value={formatDuration(today.total * 60)} label="trabajado hoy" />
            <DayStat value={`${today.focusPct}%`} label="foco" />
            <DayStat value={String(today.count)} label={today.count === 1 ? "sesión" : "sesiones"} />
            {today.byProject[0] && (
              <DayStat value={today.byProject[0].label} label="proyecto principal" truncate />
            )}
          </div>
        ) : (
          <p className="mt-4 border-t border-accent/15 pt-4 text-caption text-muted">
            Aún sin tiempo registrado hoy. Dale play a una tarea o registra un tramo para ver tu jornada aquí.
          </p>
        )}
      </Link>

      {/* Pulso — métrica insignia (semanal). Sin tiempo medido esta semana el Pulso
          va neutro (—) y los factores en 0, no el 25 ámbar + defaults inventados. */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex shrink-0 justify-center">
            <ScoreRing value={pulse.score} size={148} label="Pulso" sublabel="esta semana" empty={pulse.weekMinutes === 0} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg">{pulse.headline}</p>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {(Object.keys(pulse.components) as (keyof PulseComponents)[]).map((k) => (
                <ComponentBar key={k} label={PULSE_LABELS[k]} value={pulse.weekMinutes === 0 ? 0 : pulse.components[k]} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {empty ? (
        <EmptyState
          icon={<Clock size={28} />}
          title="Sin actividad en este rango"
          hint="Prueba otro periodo arriba, o dale play a una tarea para empezar a medir."
        />
      ) : (
        <>
          {/* KPIs del rango */}
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard icon={<Clock size={14} />} label="Horas" value={formatHours(cur.min * 60)} curr={cur.min} prev={prv?.min ?? null} spark={totalSpark} />
            <KpiCard icon={<ListChecks size={14} />} label="Tareas" value={String(cur.tasks)} curr={cur.tasks} prev={prv?.tasks ?? null} />
            <KpiCard icon={<CalendarCheck size={14} />} label="Días activos" value={String(cur.days)} curr={cur.days} prev={prv?.days ?? null} />
            <KpiCard icon={<Gauge size={14} />} label="Horas / día" value={formatHours(cur.perDay * 60)} curr={Math.round(cur.perDay)} prev={prv ? Math.round(prv.perDay) : null} />
          </motion.div>

          {/* Avance en el tiempo — la vista estrella */}
          <div className="rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-accent" />
                <h2 className="text-heading text-fg">Avance en el tiempo</h2>
                <span className="text-caption text-muted">· {granLabel}</span>
              </div>
              <div className="inline-flex gap-0.5 rounded-control border border-line bg-surface p-0.5">
                {GROUPS.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setGroupBy(g.key)}
                    className={`focus-ring rounded-[7px] px-2.5 py-1 text-caption font-medium transition ${groupBy === g.key ? "bg-ink text-white" : "text-muted hover:text-fg"}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <Chart
              series={ts.series.map((s) => ({ key: s.key, label: groupBy === "none" ? undefined : s.label, color: s.color, values: s.values }))}
              labels={ts.buckets}
              height={200}
            />
          </div>

          {/* Desgloses */}
          <div className="grid gap-3 lg:grid-cols-2">
            <BreakdownCard title="Por área de trabajo" series={byArea} icon />
            <BreakdownCard title="Por cliente" series={byClient} />
          </div>
        </>
      )}
    </div>
  );
}

function DayStat({ value, label, truncate }: { value: string; label: string; truncate?: boolean }) {
  return (
    <span className={`flex flex-col ${truncate ? "min-w-0" : ""}`}>
      <span className={`text-base font-semibold text-fg ${truncate ? "max-w-[10rem] truncate" : ""}`}>{value}</span>
      <span className="text-caption text-muted">{label}</span>
    </span>
  );
}

function ComponentBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-caption text-muted">{label}</span>
        <span className="tabular text-caption font-semibold text-fg">{pct}</span>
      </div>
      <Meter value={pct} label={`${label}: ${pct} de 100`} height="h-1.5" />
    </div>
  );
}

function KpiCard({ icon, label, value, curr, prev, spark }: { icon: React.ReactNode; label: string; value: string; curr: number; prev: number | null; spark?: number[] }) {
  return (
    <motion.div variants={fadeUp} className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <Stat icon={icon} label={label} value={value} delta={toDelta(curr, prev)} />
      {spark && spark.length > 1 && <Chart values={spark} height={34} bare className="mt-3" />}
    </motion.div>
  );
}

function BreakdownCard({ title, series, icon }: { title: string; series: { key: string; label: string; color?: string; total: number }[]; icon?: boolean }) {
  const items = series.map((s) => ({ key: s.key, label: s.label, minutes: s.total, cost: 0, color: s.color }));
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6">
      <h2 className="mb-4 text-heading text-fg">{title}</h2>
      {items.length === 0 ? (
        <p className="text-body text-muted">Sin datos en este rango.</p>
      ) : (
        <Bars items={items} showCost={false} icon={icon} />
      )}
    </div>
  );
}
