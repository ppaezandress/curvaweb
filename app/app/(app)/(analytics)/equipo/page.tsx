"use client";

import { AdminOnly } from "@/components/AdminOnly";
import { useEffect, useMemo, useState } from "react";
import { Clock, Users, Wallet, Gauge, Flame, Building2, CheckSquare, Receipt, Activity, TrendingUp, Loader2, Sparkles, Settings2, Download, Printer } from "lucide-react";
import { useData } from "@/lib/data-context";
import { formatHours } from "@/lib/format";
import { useRates, money } from "@/lib/rates";
import { toCSV, downloadCSV } from "@/lib/export";
import { computeStreak, dayKey } from "@/lib/streaks";
import { rangeStart, prevRange, smoothCurve, type Range } from "@/lib/analytics";
import { mondayOf } from "@/lib/date";
import { statusToneClass } from "@/lib/mock-data";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { KpiDelta } from "@/components/ui/KpiDelta";
import { Bars } from "@/components/analytics/Bars";
import { TypeIcon } from "@/components/TypeIcon";
import { Avatar } from "@/components/Avatar";
import { TeamPresence } from "@/components/TeamPresence";
import type { Member } from "@/lib/mock-data";

type Rec = { id: string; taskId: string; person: string; start: string; minutes: number; mode?: "manual" | "ai" };

export default function EquipoPage() {
  return (
    <AdminOnly>
      <EquipoView />
    </AdminOnly>
  );
}

function EquipoView() {
  const { taskById, projectById, clientById, taskTypeById, members } = useData();
  const { rateFor, setDefault, setPerson, rates } = useRates();

  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("month");
  const [showRates, setShowRates] = useState(false);

  const exportCSV = () => {
    const headers = ["Persona", "Cliente", "Tipo", "Estado", "Tarea", "Fecha", "Minutos", "Horas", "Costo (MXN)"];
    const data = rows.map((r) => [
      r.person, r.clientName, r.typeLabel, r.status, taskById[r.taskId]?.name || "(externa)",
      r.start?.slice(0, 10) || "", r.minutes, (r.minutes / 60).toFixed(2), Math.round(r.cost),
    ]);
    downloadCSV(`curva-equipo-${range}.csv`, toCSV(headers, data));
  };

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

  // Enriquecer un registro con cliente / tipo / estado / costo / facturable.
  const enrich = useMemo(() => {
    return (r: Rec) => {
      const task = taskById[r.taskId];
      const project = task ? projectById[task.projectId] : undefined;
      const client = project ? clientById[project.clientId] : undefined;
      const type = task ? taskTypeById[task.typeId] : undefined;
      return {
        ...r,
        clientId: client?.id || "—",
        clientName: client?.name || "Sin cliente",
        clientStatus: client?.status || "",
        typeId: type?.id || "sin-tipo",
        typeLabel: type?.label || "Sin tipo",
        typeColor: type?.color || "var(--color-accent)",
        status: task?.status || "Sin estado",
        internal: task?.internal ?? !client,
        cost: (r.minutes / 60) * rateFor(r.person),
      };
    };
  }, [taskById, projectById, clientById, taskTypeById, rateFor]);

  const rows = useMemo(() => {
    const from = rangeStart(range);
    return records.filter((r) => r.start && new Date(r.start).getTime() >= from).map(enrich);
  }, [records, range, enrich]);

  const prevRows = useMemo(() => {
    const p = prevRange(range);
    if (!p) return null;
    return records.filter((r) => {
      const t = r.start ? new Date(r.start).getTime() : 0;
      return t >= p.start && t < p.end;
    }).map(enrich);
  }, [records, range, enrich]);

  const totalMin = rows.reduce((a, r) => a + r.minutes, 0);
  const totalCost = rows.reduce((a, r) => a + r.cost, 0);
  const billableMin = rows.reduce((a, r) => a + (r.internal ? 0 : r.minutes), 0);
  const showCost = totalCost > 0;
  const billablePct = totalMin > 0 ? Math.round((billableMin / totalMin) * 100) : 0;

  const prevTotalMin = prevRows ? prevRows.reduce((a, r) => a + r.minutes, 0) : null;
  const prevCost = prevRows ? prevRows.reduce((a, r) => a + r.cost, 0) : null;
  const prevPeople = prevRows ? new Set(prevRows.map((r) => r.person)).size : null;

  // Racha ACTUAL por persona — sobre TODO el historial, no solo el rango.
  const streakByPerson = useMemo(() => {
    const days = new Map<string, Set<string>>();
    records.forEach((r) => {
      if (!r.start) return;
      if (!days.has(r.person)) days.set(r.person, new Set());
      days.get(r.person)!.add(dayKey(new Date(r.start).getTime()));
    });
    const out: Record<string, number> = {};
    days.forEach((set, person) => (out[person] = computeStreak(set).current));
    return out;
  }, [records]);

  // Minutos del periodo anterior por persona (para el delta de cada tarjeta).
  const prevMinByPerson = useMemo(() => {
    const m: Record<string, number> = {};
    (prevRows || []).forEach((r) => (m[r.person] = (m[r.person] || 0) + r.minutes));
    return m;
  }, [prevRows]);

  // Por persona (en rango): tarjeta rica.
  const people = useMemo(() => {
    type P = {
      name: string; minutes: number; cost: number; tasks: Set<string>; days: Set<string>;
      aiMin: number; clientMin: Map<string, number>; typeMin: Map<string, number>;
    };
    const m = new Map<string, P>();
    rows.forEach((r) => {
      if (!m.has(r.person)) m.set(r.person, { name: r.person, minutes: 0, cost: 0, tasks: new Set(), days: new Set(), aiMin: 0, clientMin: new Map(), typeMin: new Map() });
      const p = m.get(r.person)!;
      p.minutes += r.minutes;
      p.cost += r.cost;
      if (r.taskId) p.tasks.add(r.taskId);
      if (r.start) p.days.add(dayKey(new Date(r.start).getTime()));
      if (r.mode === "ai") p.aiMin += r.minutes;
      p.clientMin.set(r.clientName, (p.clientMin.get(r.clientName) || 0) + r.minutes);
      p.typeMin.set(r.typeId, (p.typeMin.get(r.typeId) || 0) + r.minutes);
    });
    return [...m.values()]
      .map((p) => {
        const days = p.days.size;
        const topType = [...p.typeMin.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        return {
          name: p.name,
          minutes: p.minutes,
          cost: p.cost,
          tasks: p.tasks.size,
          days,
          avgPerDay: days ? p.minutes / days : 0,
          aiMin: p.aiMin,
          manualMin: p.minutes - p.aiMin,
          topClient: [...p.clientMin.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
          topTypeId: topType,
          topTypeLabel: topType ? taskTypeById[topType]?.label || "—" : "—",
          topTypeColor: topType ? taskTypeById[topType]?.color || "var(--color-accent)" : "var(--color-accent)",
          streak: streakByPerson[p.name] || 0,
          prevMinutes: prevRows ? (prevMinByPerson[p.name] ?? 0) : null,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);
  }, [rows, streakByPerson, prevMinByPerson, prevRows, taskTypeById]);

  // Por área / tipo de entregable (Bars con TypeIcon).
  const byType = useMemo(() => {
    const m = new Map<string, { key: string; label: string; minutes: number; cost: number; color?: string; _t: Set<string> }>();
    rows.forEach((r) => {
      if (!m.has(r.typeId)) m.set(r.typeId, { key: r.typeId, label: r.typeLabel, minutes: 0, cost: 0, color: r.typeColor, _t: new Set() });
      const g = m.get(r.typeId)!;
      g.minutes += r.minutes; g.cost += r.cost;
      if (r.taskId) g._t.add(r.taskId);
    });
    return [...m.values()].map(({ _t, ...g }) => ({ ...g, count: _t.size })).sort((a, b) => b.minutes - a.minutes);
  }, [rows]);

  // Salud de la operación: horas + tareas por estado.
  const byStatus = useMemo(() => {
    const m = new Map<string, { status: string; minutes: number; tasks: Set<string> }>();
    rows.forEach((r) => {
      if (!m.has(r.status)) m.set(r.status, { status: r.status, minutes: 0, tasks: new Set() });
      const g = m.get(r.status)!;
      g.minutes += r.minutes;
      if (r.taskId) g.tasks.add(r.taskId);
    });
    return [...m.values()].map((g) => ({ status: g.status, minutes: g.minutes, tasks: g.tasks.size })).sort((a, b) => b.minutes - a.minutes);
  }, [rows]);

  // Por cliente: horas + costo + estado + nº de personas.
  const byClient = useMemo(() => {
    const m = new Map<string, { key: string; label: string; minutes: number; cost: number; status: string; people: Set<string> }>();
    rows.forEach((r) => {
      if (!m.has(r.clientId)) m.set(r.clientId, { key: r.clientId, label: r.clientName, minutes: 0, cost: 0, status: r.clientStatus, people: new Set() });
      const g = m.get(r.clientId)!;
      g.minutes += r.minutes; g.cost += r.cost;
      if (r.person) g.people.add(r.person);
    });
    return [...m.values()].map((g) => ({ ...g, peopleCount: g.people.size })).sort((a, b) => b.minutes - a.minutes);
  }, [rows]);

  // Tendencia del equipo: minutos por semana, últimas 8.
  const trend = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const thisMonday = mondayOf(now).getTime();
    const weeks: number[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = thisMonday - i * 7 * 86_400_000;
      const we = ws + 7 * 86_400_000;
      weeks.push(records.reduce((a, r) => {
        const t = r.start ? new Date(r.start).getTime() : 0;
        return t >= ws && t < we ? a + r.minutes : a;
      }, 0));
    }
    return weeks;
  }, [records]);

  const activePeople = people.length;
  const avgPerPerson = activePeople ? totalMin / activePeople : 0;
  const prevAvgPerPerson = prevRows && prevPeople ? prevTotalMin! / prevPeople : null;
  const maxP = Math.max(...people.map((p) => p.minutes), 1);
  const maxStatus = Math.max(...byStatus.map((s) => s.minutes), 1);
  const trendMax = Math.max(...trend, 1);
  const { line, area } = smoothCurve(trend, trendMax);
  const lastWeek = trend[trend.length - 1] || 0;
  const empty = !loading && rows.length === 0;

  return (
    <div className="space-y-7">
      <SectionHeader
        title="Equipo"
        subtitle="El panorama completo: en qué se va el tiempo del equipo, cuánto cuesta y quién anda en qué."
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm shadow-soft">
              {(["week", "month", "all"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3 py-1.5 font-medium transition focus-ring ${range === r ? "bg-ink text-white" : "text-muted"}`}
                >
                  {r === "week" ? "Semana" : r === "month" ? "Mes" : "Todo"}
                </button>
              ))}
            </div>
            <button onClick={() => setShowRates((s) => !s)} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-muted shadow-soft transition focus-ring hover:border-zinc-300">
              <Settings2 size={15} /> Tarifas
            </button>
            <button onClick={exportCSV} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-muted shadow-soft transition focus-ring hover:border-zinc-300">
              <Download size={15} /> CSV
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white transition focus-ring hover:bg-ink-soft">
              <Printer size={15} /> PDF
            </button>
          </div>
        }
      />

      {/* Editor de tarifas (para el costo) */}
      {showRates && (
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft print:hidden">
          <h3 className="mb-1 font-display font-bold text-fg">Tarifas por hora (MXN)</h3>
          <p className="mb-4 text-sm text-muted">Para estimar el costo del tiempo. Se guardan en este dispositivo.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="font-medium text-muted">Default</span>
              <input type="number" min={0} value={rates.default || ""} onChange={(e) => setDefault(Number(e.target.value))} className="w-24 rounded-lg border border-line px-2 py-1 text-right tabular outline-none focus:border-accent" placeholder="0" />
            </label>
            {members.filter((m) => m.name && m.name !== "—").map((m) => (
              <label key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                <span className="truncate font-medium text-muted">{m.name}</span>
                <input type="number" min={0} value={rates.byPerson[m.name] || ""} onChange={(e) => setPerson(m.name, Number(e.target.value))} className="w-24 rounded-lg border border-line px-2 py-1 text-right tabular outline-none focus:border-accent" placeholder={String(rates.default || 0)} />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* En vivo ahora — presencia en tiempo real (independiente del rango/loading) */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-curva-teal opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-curva-teal" /></span>
          En vivo ahora
        </h2>
        <TeamPresence />
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">
          Sin registros del equipo en este rango.
        </div>
      ) : (
        <>
          {/* KPIs con delta */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiDelta icon={<Clock size={16} />} label="Horas del equipo" value={formatHours(totalMin * 60)} curr={totalMin} prev={prevTotalMin} />
            <KpiDelta icon={<Users size={16} />} label="Personas activas" value={String(activePeople)} curr={activePeople} prev={prevPeople} />
            <KpiDelta icon={<Gauge size={16} />} label="Horas por persona" value={formatHours(avgPerPerson * 60)} curr={avgPerPerson} prev={prevAvgPerPerson} />
            <KpiDelta icon={<Receipt size={16} />} label="Facturable" value={formatHours(billableMin * 60)} curr={billableMin} prev={null} hint={`${billablePct}% del tiempo es de cliente`} />
            <KpiDelta icon={<Wallet size={16} />} label="Costo del tiempo" value={showCost ? money(totalCost) : "—"} curr={totalCost} prev={prevCost} hint={showCost ? undefined : "Setea tarifas en Reportes"} />
          </div>

          {/* Tendencia del equipo */}
          <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <TrendingUp size={20} /> Tendencia del equipo
              </h2>
              <p className="text-sm text-muted">Última semana: <span className="font-semibold text-fg">{formatHours(lastWeek * 60)}</span></p>
            </div>
            <p className="mb-4 text-sm text-muted">Horas del equipo por semana — últimas 8 semanas.</p>
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-28 w-full">
              <defs>
                <linearGradient id="teamTrendG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-curva-purple)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--color-curva-purple)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#teamTrendG)" />
              <path d={line} fill="none" stroke="var(--color-curva-purple)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </section>

          {/* Por persona — tarjetas ricas */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold text-fg">
              <Users size={20} /> Por persona
            </h2>
            <p className="mb-4 text-sm text-muted">Carga, foco y constancia de cada quien en el periodo.</p>
            <div className="grid gap-4 md:grid-cols-2">
              {people.map((p) => {
                const dpct = p.prevMinutes && p.prevMinutes > 0 ? Math.round(((p.minutes - p.prevMinutes) / p.prevMinutes) * 100) : null;
                const member = memberByName[p.name];
                return (
                  <div key={p.name} className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
                    <div className="flex items-center gap-3">
                      <Avatar member={member} name={p.name} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-fg">{p.name}</p>
                        {member?.role && <p className="truncate text-xs text-muted">{member.role}</p>}
                      </div>
                      <div className="text-right">
                        <p className="tabular font-display text-lg font-bold text-fg">{formatHours(p.minutes * 60)}</p>
                        {dpct !== null && dpct !== 0 && (
                          <p className={`text-xs font-semibold ${dpct > 0 ? "text-emerald-600" : "text-muted"}`}>{dpct > 0 ? "↑" : "↓"} {Math.abs(dpct)}%</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full curva-gradient" style={{ width: `${(p.minutes / maxP) * 100}%` }} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1"><CheckSquare size={12} /> {p.tasks} {p.tasks === 1 ? "tarea" : "tareas"}</span>
                      <span className="inline-flex items-center gap-1"><Activity size={12} /> {p.days} {p.days === 1 ? "día" : "días"}</span>
                      <span>~{formatHours(p.avgPerDay * 60)}/día</span>
                      {p.streak > 0 && <span className="inline-flex items-center gap-1 text-amber-500"><Flame size={12} /> {p.streak}d</span>}
                      {showCost && p.cost > 0 && <span className="tabular text-curva-teal">{money(p.cost)}</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-1 font-medium text-fg">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded text-white" style={{ background: p.topTypeColor }}><TypeIcon typeId={p.topTypeId || ""} size={10} /></span>
                        {p.topTypeLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-muted"><Building2 size={11} /> {p.topClient}</span>
                      {p.aiMin > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-curva-indigo"><Sparkles size={11} /> {Math.round((p.aiMin / p.minutes) * 100)}% IA</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* En qué anda el equipo: áreas + salud */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <TrendingUp size={20} /> Por área de trabajo
              </h2>
              <p className="mb-5 text-sm text-muted">En qué tipo de entregable se va el tiempo — y cuánto cuesta cada uno.</p>
              <Bars items={byType} showCost={showCost} icon showAvg />
            </section>

            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
                <Activity size={20} /> Salud de la operación
              </h2>
              <p className="mb-5 text-sm text-muted">Horas por estado de tarea — dónde está atorada la operación.</p>
              <div className="space-y-3">
                {byStatus.map((s) => (
                  <div key={s.status}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusToneClass(s.status)}`}>{s.status}</span>
                      <span className="shrink-0 text-muted">
                        <span className="tabular font-semibold text-fg">{formatHours(s.minutes * 60)}</span>
                        <span className="ml-2 text-xs">· {s.tasks} {s.tasks === 1 ? "tarea" : "tareas"}</span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(s.minutes / maxStatus) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Por cliente — rentabilidad + estado */}
          <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
              <Building2 size={20} /> Por cliente
            </h2>
            <p className="mb-5 text-sm text-muted">Dónde se concentra el esfuerzo, su estado y cuánto cuesta.</p>
            <div className="space-y-4">
              {byClient.map((c) => {
                const cmax = Math.max(...byClient.map((x) => x.minutes), 1);
                return (
                  <div key={c.key}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 font-semibold text-fg">
                        <span className="truncate">{c.label}</span>
                        {c.status && <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusToneClass(c.status)}`}>{c.status}</span>}
                      </span>
                      <span className="shrink-0 text-muted">
                        <span className="tabular font-semibold text-fg">{formatHours(c.minutes * 60)}</span>
                        {showCost && <span className="tabular ml-2 text-curva-teal">{money(c.cost)}</span>}
                        <span className="ml-2 text-xs">· {c.peopleCount} {c.peopleCount === 1 ? "persona" : "personas"}</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(c.minutes / cmax) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
