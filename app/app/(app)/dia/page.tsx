"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowLeft, Target, Briefcase, Users, Gauge, Sunrise, Sunset, Timer, Layers,
  Repeat, CalendarCheck, Clock3, Sparkles, Pencil, Flame, Coffee,
} from "lucide-react";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { useTimeRecords } from "@/lib/use-time-records";
import { formatDuration } from "@/lib/format";
import { analyzeDay, type Group } from "@/lib/day-analytics";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hourLabel = (h: number) => { const ap = h < 12 ? "a" : "p"; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}${ap}`; };
const H = 3_600_000;

export default function DiaPage() {
  const { currentUserId, entries } = useApp();
  const { taskById, projectById, clientById, taskTypeById, memberById, recentEntries } = useData();
  const { records } = useTimeRecords();
  const [hover, setHover] = useState<string | null>(null);
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const a = useMemo(() => analyzeDay(
    { records, recentEntries, entries, myName: (me?.name || "").trim(), dayStart: new Date().setHours(0, 0, 0, 0), now: Date.now(), priorRecords: records, priorDays: 30 },
    { taskById, projectById, clientById, taskTypeById },
  ), [records, recentEntries, entries, me, taskById, projectById, clientById, taskTypeById]);

  const todayLabel = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const colorByKey: Record<string, string> = {};
  a.byProject.forEach((g) => { colorByKey[g.key] = g.color; });

  // Ventana de la timeline
  let winStart = new Date().setHours(8, 0, 0, 0), span = 12 * H;
  if (a.sessions.length) {
    winStart = new Date(a.firstStart).setMinutes(0, 0, 0);
    let winEnd = Math.ceil(a.lastEnd / H) * H;
    if (winEnd - winStart < 4 * H) winEnd = winStart + 4 * H;
    span = winEnd - winStart;
  }
  const ticks: number[] = [];
  for (let t = winStart; t <= winStart + span + 1; t += Math.max(H, Math.ceil(span / 8 / H) * H)) ticks.push(t);
  const now = Date.now();
  const nowPct = span > 0 ? ((now - winStart) / span) * 100 : -1;
  const hovered = a.sessions.find((s) => s.id === hover);

  // Resumen narrativo del día
  const narrative = useMemo(() => {
    if (!a.sessions.length) return "";
    const parts: string[] = [];
    parts.push(`Mediste ${formatDuration(a.total * 60)} en ${a.byProject.length} ${a.byProject.length === 1 ? "proyecto" : "proyectos"}`);
    if (a.peakSlot) parts.push(`tu pico fue en la ${a.peakSlot.toLowerCase()}`);
    parts.push(`${a.focusPct}% de foco`);
    if (a.meetingPct >= 25) parts.push(`${a.meetingPct}% en juntas`);
    if (a.avgDayMin > 0) parts.push(`${a.deltaVsAvgPct >= 0 ? "+" : ""}${a.deltaVsAvgPct}% vs tu media`);
    return parts.join(" · ") + ".";
  }, [a]);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      {/* Encabezado */}
      <motion.div variants={fadeUp} className="flex items-center gap-3">
        <Link href="/dashboard" className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-control border border-line text-muted transition hover:border-accent hover:text-accent"><ArrowLeft size={17} /></Link>
        <div>
          <p className="text-caption font-medium text-muted">Análisis de tu día</p>
          <h1 className="font-display text-xl font-bold capitalize leading-tight text-fg sm:text-2xl">{todayLabel}</h1>
        </div>
      </motion.div>

      {a.sessions.length === 0 ? (
        <motion.div variants={fadeUp} className="rounded-card border border-dashed border-line py-16 text-center">
          <p className="text-lg font-semibold text-fg">Aún no mides nada hoy</p>
          <p className="mt-1 text-body text-muted">Cuando midas tiempo, aquí verás el análisis completo de tu jornada.</p>
          <Link href="/dashboard" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">Ir a Inicio</Link>
        </motion.div>
      ) : (
        <>
          {/* Hero: total + resumen + KPIs */}
          <motion.section variants={fadeUp} className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-card border border-line bg-surface p-6 shadow-soft lg:col-span-1">
              <p className="text-caption font-medium text-muted">Trabajado hoy</p>
              <p className="tabular font-display text-[3rem] font-bold leading-none text-fg">{formatDuration(a.total * 60)}</p>
              <p className="mt-2 text-caption text-muted">{a.count} sesiones · {a.tasksTouched} tareas · {formatDuration(a.active * 60)} de foco activo</p>
              {narrative && <p className="mt-3 border-t border-line pt-3 text-caption leading-relaxed text-muted">{narrative}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-2">
              <Kpi icon={<Target size={14} />} label="Foco" value={`${a.focusPct}%`} hint={`${formatDuration(a.inactive * 60)} inactivo`} tone={a.focusPct >= 80 ? "success" : a.focusPct >= 60 ? "warn" : undefined} />
              <Kpi icon={<Briefcase size={14} />} label="Facturable" value={`${a.billablePct}%`} hint={formatDuration(a.billableMin * 60)} />
              <Kpi icon={<Users size={14} />} label="En juntas" value={`${a.meetingPct}%`} hint={formatDuration(a.meetingMin * 60)} />
              <Kpi icon={<Gauge size={14} />} label="Densidad" value={`${a.densityPct}%`} hint={`${formatDuration(a.gapsMin * 60)} en huecos`} />
            </div>
          </motion.section>

          {/* Timeline grande */}
          <motion.section variants={fadeUp} className="rounded-card border border-line bg-surface p-5 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-heading text-fg">La forma de tu día</p>
              <p className="text-caption text-muted">{hhmm(a.firstStart)}–{hhmm(a.lastEnd)} · jornada de {formatDuration(a.spanMin * 60)}</p>
            </div>
            <div className="mb-2 h-7">
              {hovered ? (
                <div className="inline-flex rounded-control bg-surface-2 px-3 py-1.5 text-caption shadow-soft">
                  <span className="font-semibold text-fg">{hovered.task || hovered.project}</span>
                  <span className="text-muted"> · {hhmm(hovered.start)}–{hhmm(hovered.end)} · {formatDuration(hovered.minutes * 60)} · {hovered.activity}</span>
                </div>
              ) : <p className="px-1 text-caption text-muted/80">Pasa el cursor por un bloque para ver el detalle de esa sesión.</p>}
            </div>
            <div className="relative h-14 overflow-hidden rounded-control bg-surface-2 ring-1 ring-inset ring-line">
              {nowPct >= 0 && nowPct <= 100 && <div className="absolute inset-y-0 z-20 w-px bg-fg/40" style={{ left: `${nowPct}%` }} aria-hidden />}
              {a.sessions.map((s) => {
                const left = ((s.start - winStart) / span) * 100;
                const width = ((s.minutes * 60000) / span) * 100;
                const on = hover === s.id;
                return (
                  <button key={s.id}
                    onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover((h) => (h === s.id ? null : h))}
                    onFocus={() => setHover(s.id)} onBlur={() => setHover((h) => (h === s.id ? null : h))}
                    aria-label={`${s.task || s.project}, ${hhmm(s.start)} a ${hhmm(s.end)}, ${formatDuration(s.minutes * 60)}`}
                    className="absolute top-1/2 z-10 h-9 -translate-y-1/2 rounded-md ring-2 ring-surface transition focus:outline-none"
                    style={{ left: `${left}%`, width: `max(0.5rem, ${width}%)`, background: colorByKey[s.projectKey], opacity: on || !hover ? 1 : 0.45, transform: `translateY(-50%) scaleY(${on ? 1.1 : 1})` }}
                  />
                );
              })}
            </div>
            <div className="relative mt-1.5 h-3 text-caption tabular text-muted">
              {ticks.map((t) => {
                const left = ((t - winStart) / span) * 100;
                if (left < -1 || left > 101) return null;
                return <span key={t} className="absolute -translate-x-1/2" style={{ left: `${Math.min(98, Math.max(2, left))}%` }}>{hourLabel(new Date(t).getHours())}</span>;
              })}
            </div>
          </motion.section>

          {/* Desgloses */}
          <motion.section variants={fadeUp} className="grid gap-4 md:grid-cols-2">
            <Breakdown title="Por proyecto" groups={a.byProject} total={a.total} />
            <Breakdown title="Por pilar de negocio" groups={a.byPilar} total={a.total} />
            <Breakdown title="Por tipo de actividad" groups={a.byActivity} total={a.total} />
            <Breakdown title="Por cliente" groups={a.byClient} total={a.total} />
          </motion.section>

          {/* Ritmo + profundidad */}
          <motion.section variants={fadeUp}>
            <p className="mb-3 text-heading text-fg">Ritmo y profundidad</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat icon={<Sunrise size={15} />} label="Arrancaste" value={hhmm(a.firstStart)} />
              <Stat icon={<Sunset size={15} />} label="Terminaste" value={hhmm(a.lastEnd)} />
              <Stat icon={<Timer size={15} />} label="Sesión más larga" value={formatDuration(a.longest * 60)} />
              <Stat icon={<Layers size={15} />} label="Bloques profundos" value={`${a.deepBlocks}`} hint="≥ 50 min" />
              <Stat icon={<Repeat size={15} />} label="Cambios de contexto" value={`${a.switches}`} hint="saltos de proyecto" />
              <Stat icon={<Coffee size={15} />} label="Huecos" value={formatDuration(a.gapsMin * 60)} hint="sin medir" />
            </div>
            {/* Distribución por franja */}
            <div className="mt-4 rounded-card border border-line bg-surface p-4 shadow-soft">
              <p className="mb-2.5 text-caption font-semibold text-muted">Cuándo rindes</p>
              <div className="flex gap-2">
                {["Mañana", "Tarde", "Noche"].map((slot, i) => {
                  const g = a.bySlot.find((x) => x.label === slot);
                  const min = g?.minutes || 0;
                  const pct = a.total > 0 ? Math.round((min / a.total) * 100) : 0;
                  const icon = [<Sunrise key="a" size={14} />, <Flame key="b" size={14} />, <Sunset key="c" size={14} />][i];
                  return (
                    <div key={slot} className="flex-1 rounded-control border border-line bg-surface-2/50 p-3 text-center">
                      <p className="flex items-center justify-center gap-1 text-caption font-medium text-muted">{icon} {slot}</p>
                      <p className="tabular mt-1 font-display text-lg font-bold text-fg">{formatDuration(min * 60)}</p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.section>

          {/* Cumplimiento + bitácora */}
          <motion.section variants={fadeUp} className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
              <p className="mb-3 flex items-center gap-1.5 text-heading text-fg"><CalendarCheck size={16} /> Cumplimiento</p>
              <div className="space-y-3 text-sm">
                <Row label="Tareas con entrega hoy" value={`${a.dueTouched}/${a.dueToday}`} hint={a.dueToday === 0 ? "nada vence hoy" : a.dueTouched >= a.dueToday ? "todas atendidas" : "pendientes por tocar"} />
                <Row label="Tareas tocadas" value={`${a.tasksTouched}`} />
                <Row label="Promedio por sesión" value={formatDuration(a.avg * 60)} />
                <Row label="Trabajo profundo" value={formatDuration(a.deepMin * 60)} hint={`${100 - a.meetingPct}% del día`} />
              </div>
            </div>
            <div className="lg:col-span-2">
              <p className="mb-2.5 text-heading text-fg">Bitácora del día</p>
              <div className="space-y-1.5">
                {[...a.sessions].reverse().map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorByKey[s.projectKey] }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{s.task || s.project}</p>
                      <p className="tabular text-caption text-muted">{hhmm(s.start)}–{hhmm(s.end)} · {s.project}{s.client ? ` · ${s.client}` : ""} · {s.activity}</p>
                    </div>
                    {s.mode === "ai"
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-caption font-semibold text-accent"><Sparkles size={11} /> IA</span>
                      : s.origin === "manual"
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-caption font-medium text-muted"><Pencil size={10} /> A mano</span>
                        : null}
                    <span className="tabular flex shrink-0 items-center gap-1 text-sm font-semibold text-fg"><Clock3 size={12} className="text-muted" /> {formatDuration(s.minutes * 60)}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        </>
      )}
    </motion.div>
  );
}

function Kpi({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone?: "success" | "warn" }) {
  const c = tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : "text-fg";
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <p className="flex items-center gap-1.5 text-caption font-medium text-muted">{icon} {label}</p>
      <p className={`tabular mt-1 font-display text-2xl font-bold ${c}`}>{value}</p>
      {hint && <p className="mt-0.5 text-caption text-muted">{hint}</p>}
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3.5 shadow-soft">
      <p className="flex items-center gap-1.5 text-caption font-medium text-muted">{icon} {label}</p>
      <p className="tabular mt-1 font-display text-lg font-bold text-fg">{value}</p>
      {hint && <p className="text-caption text-muted">{hint}</p>}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted">{label}{hint && <span className="ml-1 text-caption text-muted/70">· {hint}</span>}</span>
      <span className="tabular shrink-0 font-semibold text-fg">{value}</span>
    </div>
  );
}

function Breakdown({ title, groups, total }: { title: string; groups: Group[]; total: number }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <p className="mb-3 text-caption font-semibold text-muted">{title}</p>
      <div className="space-y-3">
        {groups.length === 0 ? (
          <p className="text-caption text-muted">Sin datos.</p>
        ) : groups.map((g) => (
          <div key={g.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
                <span className="truncate font-medium text-fg">{g.label}</span>
                {g.sublabel && <span className="hidden shrink-0 text-caption text-muted sm:inline">· {g.sublabel}</span>}
              </span>
              <span className="tabular shrink-0 font-semibold text-fg">{formatDuration(g.minutes * 60)} <span className="font-normal text-muted">{g.pct}%</span></span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${Math.max(g.pct, 2)}%`, background: g.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
