"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Clock, CalendarDays, Target, Wallet,
  Users2, Layers, Download, Loader2, Flame, Pencil, Sparkles,
} from "lucide-react";
import { AdminOnly } from "@/components/AdminOnly";
import { useData } from "@/lib/data-context";
import { useTimeRecords } from "@/lib/use-time-records";
import { analyzePerson, periodFor, type PeriodKind, type Point } from "@/lib/person-analytics";
import type { Group } from "@/lib/day-analytics";
import { formatDuration, formatHours } from "@/lib/format";
import { useRates, money } from "@/lib/rates";
import { toCSV, downloadCSV } from "@/lib/export";
import { computeStreak, dayKey } from "@/lib/streaks";
import { Avatar } from "@/components/Avatar";
import { MetricHint } from "@/components/ui/MetricHint";

// Detalle de UNA persona. Es la vista que faltaba: desde Equipo se veía el total de cada
// quien, pero no se podía entrar a ver EN QUÉ se le fue el tiempo. Solo admins (el muro
// individuo/equipo lo aplica también el servidor: /api/time-entries pone en cero los minutos
// ajenos para quien no es admin, así que esta página sin permisos no tendría ni datos).
export default function PersonaPage() {
  return (
    <AdminOnly>
      <PersonaView />
    </AdminOnly>
  );
}

const DIAS = ["D", "L", "M", "M", "J", "V", "S"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
};
const hora = (ms: number) =>
  new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

function PersonaView() {
  const { persona } = useParams<{ persona: string }>();
  const { members, taskById, projectById, clientById, taskTypeById, ready } = useData();
  const { records, loading } = useTimeRecords();
  const { rateFor } = useRates();

  const [kind, setKind] = useState<PeriodKind>("week");
  const [offset, setOffset] = useState(0);

  const memberId = decodeURIComponent(persona || "");
  const member = members.find((m) => m.id === memberId);
  const name = member?.name || memberId;

  const period = useMemo(() => periodFor(kind, offset), [kind, offset]);

  const maps = useMemo(
    () => ({ taskById, projectById, clientById, taskTypeById }),
    [taskById, projectById, clientById, taskTypeById],
  );

  const a = useMemo(
    () => analyzePerson({ records, person: name, from: period.from, to: period.to, prev: period.prev }, maps),
    [records, name, period, maps],
  );

  // Racha (días seguidos con actividad) — se mide sobre TODO el histórico, no sobre el
  // periodo elegido: una racha recortada por la ventana no significaría nada.
  const streak = useMemo(() => {
    const days = new Set(
      records.filter((r) => (r.person || "").trim() === name && r.minutes > 0)
        .map((r) => dayKey(new Date(r.start).getTime())),
    );
    return computeStreak(days).current;
  }, [records, name]);

  const cost = Math.round((a.totalMin / 60) * rateFor(name));

  const exportCSV = () => {
    const headers = ["Fecha", "Inicio", "Tarea", "Proyecto", "Cliente", "Minutos", "Horas", "Facturable"];
    const rows = a.sessions.map((s) => [
      new Date(s.start).toISOString().slice(0, 10), hora(s.start),
      s.task || "(sin tarea)", s.project, s.client || "Interno",
      s.minutes, (s.minutes / 60).toFixed(2), s.billable ? "Sí" : "No",
    ]);
    downloadCSV(`curva-${name.split(" ")[0].toLowerCase()}-${kind}.csv`, toCSV(headers, rows));
  };

  if (!ready || loading) {
    return (
      <div className="flex items-center gap-2 py-24 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Cargando el detalle…
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Encabezado */}
      <div>
        <Link href="/equipo" className="mb-3 inline-flex items-center gap-1.5 text-caption text-muted transition hover:text-fg">
          <ArrowLeft size={13} /> Equipo
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Avatar member={member} name={name} size={56} />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-fg">{name}</h1>
              <p className="text-sm text-muted">
                {member?.role || "Equipo CURVA"}
                {streak > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-warn">
                    <Flame size={12} /> {streak} {streak === 1 ? "día" : "días"} seguidos
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={exportCSV}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-muted shadow-soft transition hover:border-muted/40"
          >
            <Download size={14} /> Exportar
          </button>
        </div>
      </div>

      {/* Selector de periodo */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-line bg-surface p-0.5 shadow-soft">
          {([["week", "Semana"], ["month", "Mes"], ["all", "Todo"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setKind(k); setOffset(0); }}
              className={`focus-ring rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                kind === k ? "bg-ink text-white" : "text-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {kind !== "all" && (
          <div className="inline-flex items-center gap-1">
            <button
              onClick={() => setOffset((o) => o - 1)}
              className="focus-ring rounded-full border border-line bg-surface p-1.5 text-muted transition hover:text-fg"
              aria-label="Periodo anterior"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-[9rem] text-center text-sm font-semibold text-fg">{period.label}</span>
            <button
              onClick={() => setOffset((o) => Math.min(0, o + 1))}
              disabled={!period.canGoNext}
              className="focus-ring rounded-full border border-line bg-surface p-1.5 text-muted transition hover:text-fg disabled:opacity-40"
              aria-label="Periodo siguiente"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {a.totalMin === 0 ? (
        <div className="rounded-card border border-line bg-surface p-10 text-center shadow-soft">
          <p className="font-semibold text-fg">Sin tiempo registrado en {period.label.toLowerCase()}.</p>
          <p className="mt-1 text-sm text-muted">Prueba con otro periodo o mira el histórico completo.</p>
        </div>
      ) : (
        <>
          {/* Lo esencial */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<Clock size={13} />}
              label="Tiempo medido"
              value={formatHours(a.totalMin * 60)}
              hint={
                a.deltaPct === null ? `${a.sessionCount} sesiones`
                : `${a.deltaPct > 0 ? "↑" : "↓"} ${Math.abs(a.deltaPct)}% vs periodo anterior`
              }
              tone={a.deltaPct !== null && a.deltaPct > 0 ? "success" : undefined}
            />
            <Kpi
              icon={<CalendarDays size={13} />}
              label="Días trabajados"
              value={String(a.activeDays)}
              hint={`~${formatDuration(a.avgPerActiveDay * 60)} por día trabajado`}
              help="Días en los que registró aunque sea un minuto. El promedio es sobre esos días, no sobre el calendario."
            />
            <Kpi
              icon={<Wallet size={13} />}
              label="Facturable"
              value={`${a.billablePct}%`}
              hint={`${formatHours(a.billableMin * 60)} a clientes`}
              help="Tiempo en tareas de cliente contra el total. El trabajo interno de CURVA no cuenta como facturable."
            />
            <Kpi
              icon={<Target size={13} />}
              label="Foco"
              value={`${a.focusPct}%`}
              hint={a.meetingPct > 0 ? `${a.meetingPct}% en juntas` : `${a.deepBlocks} bloques profundos`}
              help="Del tiempo medido, cuánto quedó como trabajo activo (descontando lo marcado como inactivo)."
            />
          </div>

          {/* En qué se le fue el tiempo */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold text-fg">
              <Layers size={19} /> En qué se le fue el tiempo
            </h2>
            <p className="mb-4 text-sm text-muted">{period.label} · {formatHours(a.totalMin * 60)} en total.</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <Breakdown title="Por proyecto" groups={a.byProject} />
              <Breakdown title="Por cliente" groups={a.byClient} />
              <Breakdown title="Por pilar / área" groups={a.byPilar} />
              <Breakdown title="Por tipo de actividad" groups={a.byActivity} />
            </div>
          </section>

          {/* Ritmo */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold text-fg">
              <Users2 size={19} /> Ritmo
            </h2>
            <p className="mb-4 text-sm text-muted">Cómo se repartió el trabajo día a día y semana a semana.</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <Series
                title="Por día"
                points={a.byDay}
                labelOf={(p) => DIAS[new Date(p.start).getDay()]}
                subOf={(p) => fechaCorta(p.start)}
              />
              <Series
                title="Por semana"
                points={a.byWeek}
                labelOf={(p) => fechaCorta(p.start)}
                subOf={() => ""}
              />
            </div>
          </section>

          {/* Tareas que más consumieron */}
          <section>
            <h2 className="mb-1 font-display text-xl font-bold text-fg">Dónde se concentró</h2>
            <p className="mb-4 text-sm text-muted">Las tareas que más tiempo se llevaron en el periodo.</p>
            <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
              {a.topTasks.map((t, i) => (
                <div key={`${t.taskId}-${i}`} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                  <span className="tabular w-5 shrink-0 text-caption font-semibold text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{t.name}</p>
                    <p className="truncate text-caption text-muted">
                      {t.project}{t.client ? ` · ${t.client}` : ""} · {t.sessions} {t.sessions === 1 ? "sesión" : "sesiones"}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-sm font-semibold text-fg">{formatDuration(t.minutes * 60)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Bitácora */}
          <section>
            <h2 className="mb-1 font-display text-xl font-bold text-fg">Bitácora</h2>
            <p className="mb-4 text-sm text-muted">
              Cada sesión del periodo, de la más reciente a la más vieja.
              {cost > 0 && <> Costo estimado: <b className="text-fg">{money(cost)}</b>.</>}
            </p>
            <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
              {a.sessions.slice(0, 60).map((s, i) => (
                <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}>
                  <div className="w-24 shrink-0">
                    <p className="text-caption font-semibold text-fg">{fechaCorta(s.start)}</p>
                    <p className="tabular text-caption text-muted">{hora(s.start)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{s.task || "(sin tarea ligada)"}</p>
                    <p className="truncate text-caption text-muted">{s.project}{s.client ? ` · ${s.client}` : ""}</p>
                  </div>
                  {s.origin === "manual" && (
                    <span className="shrink-0 text-muted/70" title="Registrado a mano"><Pencil size={12} /></span>
                  )}
                  {s.mode === "ai" && (
                    <span className="shrink-0 text-accent" title="Tiempo con IA"><Sparkles size={12} /></span>
                  )}
                  <span className="tabular shrink-0 text-sm font-semibold text-fg">{formatDuration(s.minutes * 60)}</span>
                </div>
              ))}
              {a.sessions.length > 60 && (
                <p className="border-t border-line px-4 py-2.5 text-caption text-muted">
                  Se muestran las 60 más recientes de {a.sessions.length}. Exporta para verlas todas.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, hint, tone, help }: {
  icon: React.ReactNode; label: string; value: string; hint?: string;
  tone?: "success" | "warn"; help?: string;
}) {
  const c = tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : "text-fg";
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <p className="flex items-center gap-1.5 text-caption font-medium text-muted">
        {icon} {label}{help && <MetricHint text={help} />}
      </p>
      <p className={`tabular mt-1 font-display text-2xl font-bold ${c}`}>{value}</p>
      {hint && <p className="mt-0.5 text-caption text-muted">{hint}</p>}
    </div>
  );
}

// Mismo lenguaje visual que el desglose de /dia: color por entidad, etiqueta siempre visible
// (nunca solo color) y porcentaje junto al tiempo.
function Breakdown({ title, groups }: { title: string; groups: Group[] }) {
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
              <span className="tabular shrink-0 font-semibold text-fg">
                {formatDuration(g.minutes * 60)} <span className="font-normal text-muted">{g.pct}%</span>
              </span>
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

/** Barras verticales de una serie temporal. Los días en cero también se ven: son información. */
function Series({ title, points, labelOf, subOf }: {
  title: string; points: Point[];
  labelOf: (p: Point) => string; subOf: (p: Point) => string;
}) {
  const max = Math.max(...points.map((p) => p.minutes), 1);
  const shown = points.slice(-31);
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <p className="mb-4 text-caption font-semibold text-muted">{title}</p>
      {shown.length === 0 ? (
        <p className="text-caption text-muted">Sin datos.</p>
      ) : (
        <div className="flex h-40 items-end gap-1.5">
          {shown.map((p) => (
            <div key={p.start} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="tabular text-caption font-semibold text-fg opacity-0 transition group-hover:opacity-100">
                {p.minutes > 0 ? formatDuration(p.minutes * 60) : "—"}
              </span>
              <div
                className="w-full rounded-t bg-accent/85 transition group-hover:bg-accent"
                style={{ height: `${Math.max((p.minutes / max) * 100, p.minutes > 0 ? 4 : 1)}%` }}
                title={`${subOf(p) || labelOf(p)}: ${formatDuration(p.minutes * 60)}`}
              />
              <span className="truncate text-caption text-muted">{labelOf(p)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
