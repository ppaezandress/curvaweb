"use client";

import { AdminOnly } from "@/components/AdminOnly";
import { useEffect, useMemo, useState } from "react";
import { Clock, Users, Wallet, Gauge, Flame, Building2, CheckSquare, Loader2 } from "lucide-react";
import { useData } from "@/lib/data-context";
import { formatHours } from "@/lib/format";
import { useRates, money } from "@/lib/rates";
import { computeStreak, dayKey } from "@/lib/streaks";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Avatar } from "@/components/Avatar";
import type { Member } from "@/lib/mock-data";

type Rec = { id: string; taskId: string; person: string; start: string; minutes: number; mode?: "manual" | "ai" };
type Range = "week" | "month" | "all";

function rangeStart(range: Range): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "week") {
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d.getTime();
  }
  if (range === "month") {
    d.setDate(1);
    return d.getTime();
  }
  return 0;
}

export default function EquipoPage() {
  return (
    <AdminOnly>
      <EquipoView />
    </AdminOnly>
  );
}

function EquipoView() {
  const { taskById, projectById, clientById, members } = useData();
  const { rateFor } = useRates();

  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("month");

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

  const inRange = useMemo(() => {
    const from = rangeStart(range);
    return records.filter((r) => r.start && new Date(r.start).getTime() >= from);
  }, [records, range]);

  // Enriquecer cada registro con cliente + costo (mismo criterio que Reportes).
  const rows = useMemo(() => {
    return inRange.map((r) => {
      const task = taskById[r.taskId];
      const project = task ? projectById[task.projectId] : undefined;
      const client = project ? clientById[project.clientId] : undefined;
      return { ...r, clientName: client?.name || "Sin cliente", cost: (r.minutes / 60) * rateFor(r.person) };
    });
  }, [inRange, taskById, projectById, clientById, rateFor]);

  const totalMin = rows.reduce((a, r) => a + r.minutes, 0);
  const totalCost = rows.reduce((a, r) => a + r.cost, 0);
  const showCost = totalCost > 0;

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

  // Por persona (en rango): horas, tareas, cliente foco, costo, racha.
  const people = useMemo(() => {
    const m = new Map<
      string,
      { name: string; minutes: number; cost: number; tasks: Set<string>; clientMin: Map<string, number> }
    >();
    rows.forEach((r) => {
      if (!m.has(r.person)) m.set(r.person, { name: r.person, minutes: 0, cost: 0, tasks: new Set(), clientMin: new Map() });
      const p = m.get(r.person)!;
      p.minutes += r.minutes;
      p.cost += r.cost;
      if (r.taskId) p.tasks.add(r.taskId);
      p.clientMin.set(r.clientName, (p.clientMin.get(r.clientName) || 0) + r.minutes);
    });
    return [...m.values()]
      .map((p) => ({
        name: p.name,
        minutes: p.minutes,
        cost: p.cost,
        tasks: p.tasks.size,
        topClient: [...p.clientMin.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
        streak: streakByPerson[p.name] || 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [rows, streakByPerson]);

  // Por cliente (rentabilidad): horas + costo.
  const byClient = useMemo(() => {
    const m = new Map<string, { name: string; minutes: number; cost: number }>();
    rows.forEach((r) => {
      if (!m.has(r.clientName)) m.set(r.clientName, { name: r.clientName, minutes: 0, cost: 0 });
      const c = m.get(r.clientName)!;
      c.minutes += r.minutes;
      c.cost += r.cost;
    });
    return [...m.values()].sort((a, b) => b.minutes - a.minutes);
  }, [rows]);

  const activePeople = people.length;
  const avgPerPerson = activePeople ? totalMin / activePeople : 0;
  const maxP = Math.max(...people.map((p) => p.minutes), 1);
  const maxC = Math.max(...byClient.map((c) => c.minutes), 1);
  const empty = !loading && rows.length === 0;

  return (
    <div className="space-y-7">
      <SectionHeader
        title="Equipo"
        subtitle="El panorama completo: en qué se va el tiempo del equipo y cuánto cuesta."
        action={
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
        }
      />

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
          {/* KPIs del equipo */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi icon={<Clock size={16} />} label="Horas del equipo" value={formatHours(totalMin * 60)} />
            <Kpi icon={<Users size={16} />} label="Personas activas" value={String(activePeople)} />
            <Kpi icon={<Gauge size={16} />} label="Horas por persona" value={formatHours(avgPerPerson * 60)} />
            <Kpi
              icon={<Wallet size={16} />}
              label="Costo del tiempo"
              value={showCost ? money(totalCost) : "—"}
              hint={showCost ? undefined : "Setea tarifas en Reportes"}
            />
          </div>

          {/* Por persona — el centro de mando */}
          <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
              <Users size={20} /> Por persona
            </h2>
            <p className="mb-5 text-sm text-muted">Carga, foco y constancia de cada quien en el periodo.</p>
            <div className="space-y-3">
              {people.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <Avatar member={memberByName[p.name]} name={p.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="truncate text-sm font-semibold text-fg">{p.name}</span>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
                        <span className="tabular font-semibold text-fg">{formatHours(p.minutes * 60)}</span>
                        <span className="inline-flex items-center gap-1"><CheckSquare size={12} /> {p.tasks}</span>
                        {p.streak > 0 && <span className="inline-flex items-center gap-1 text-amber-500"><Flame size={12} /> {p.streak}d</span>}
                        {showCost && <span className="tabular text-curva-teal">{money(p.cost)}</span>}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full curva-gradient" style={{ width: `${(p.minutes / maxP) * 100}%` }} />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted">
                      <Building2 size={11} className="mr-1 inline" />
                      Foco: <span className="text-fg">{p.topClient}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Por cliente — rentabilidad */}
          <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
              <Building2 size={20} /> Por cliente
            </h2>
            <p className="mb-5 text-sm text-muted">Dónde se concentra el esfuerzo del equipo — y cuánto cuesta.</p>
            <div className="space-y-4">
              {byClient.map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-semibold text-fg">{c.name}</span>
                    <span className="shrink-0 text-muted">
                      <span className="tabular font-semibold text-fg">{formatHours(c.minutes * 60)}</span>
                      {showCost && <span className="tabular ml-2 text-curva-teal">{money(c.cost)}</span>}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(c.minutes / maxC) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">{icon} {label}</p>
      <p className="tabular mt-1 font-display text-2xl font-bold text-fg">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
