"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  TrendingUp,
  Wallet,
  Tag,
  Building2,
  User,
  Download,
  Printer,
  Loader2,
  Settings2,
} from "lucide-react";
import { useData } from "@/lib/data-context";
import { formatHours } from "@/lib/format";
import { useRates, money } from "@/lib/rates";
import { toCSV, downloadCSV } from "@/lib/export";
import { TypeIcon } from "@/components/TypeIcon";

type Rec = { id: string; taskId: string; person: string; start: string; minutes: number };
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

export default function ReportesPage() {
  const { tasks, taskById, projectById, clientById, taskTypeById, members } = useData();
  const { rateFor, setPerson, setDefault, rates } = useRates();

  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("month");
  const [showRates, setShowRates] = useState(false);

  useEffect(() => {
    fetch("/api/time-entries")
      .then((r) => r.json())
      .then((d) => setRecords(d.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const inRange = useMemo(() => {
    const from = rangeStart(range);
    return records.filter((r) => r.start && new Date(r.start).getTime() >= from);
  }, [records, range]);

  // Enriquecer cada registro con cliente/proyecto/tipo + costo.
  const rows = useMemo(() => {
    return inRange.map((r) => {
      const task = taskById[r.taskId];
      const project = task ? projectById[task.projectId] : undefined;
      const client = project ? clientById[project.clientId] : undefined;
      const type = task ? taskTypeById[task.typeId] : undefined;
      const hours = r.minutes / 60;
      const cost = hours * rateFor(r.person);
      return {
        ...r,
        taskName: task?.name || "(externa)",
        clientId: client?.id || "—",
        clientName: client?.name || "Sin cliente",
        projectName: project?.name || "Sin proyecto",
        typeId: type?.id || "sin-tipo",
        typeLabel: type?.label || "Sin tipo",
        hours,
        cost,
      };
    });
  }, [inRange, taskById, projectById, clientById, taskTypeById, rateFor]);

  const totalMin = rows.reduce((a, r) => a + r.minutes, 0);
  const totalCost = rows.reduce((a, r) => a + r.cost, 0);

  type Agg = { key: string; label: string; minutes: number; cost: number; color?: string };
  const groupBy = (fn: (r: (typeof rows)[number]) => { key: string; label: string; color?: string }) => {
    const m = new Map<string, Agg>();
    rows.forEach((r) => {
      const { key, label, color } = fn(r);
      if (!m.has(key)) m.set(key, { key, label, minutes: 0, cost: 0, color });
      const g = m.get(key)!;
      g.minutes += r.minutes;
      g.cost += r.cost;
    });
    return [...m.values()].sort((a, b) => b.minutes - a.minutes);
  };

  const byClient = useMemo(() => groupBy((r) => ({ key: r.clientId, label: r.clientName })), [rows]);
  const byProject = useMemo(() => groupBy((r) => ({ key: r.projectName, label: r.projectName })), [rows]);
  const byPerson = useMemo(() => groupBy((r) => ({ key: r.person, label: r.person || "—" })), [rows]);
  const byType = useMemo(
    () => groupBy((r) => ({ key: r.typeId, label: r.typeLabel, color: taskTypeById[r.typeId]?.color })),
    [rows, taskTypeById],
  );

  const topClient = byClient[0];
  const showCost = totalCost > 0;

  const exportCSV = () => {
    const headers = ["Persona", "Cliente", "Proyecto", "Tarea", "Tipo", "Fecha", "Minutos", "Horas", "Costo (MXN)"];
    const data = rows.map((r) => [
      r.person, r.clientName, r.projectName, r.taskName, r.typeLabel,
      r.start?.slice(0, 10) || "", r.minutes, r.hours.toFixed(2), Math.round(r.cost),
    ]);
    downloadCSV(`curva-tiempos-${range}.csv`, toCSV(headers, data));
  };

  return (
    <div className="space-y-7">
      {/* Encabezado + acciones */}
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Reportes</h1>
          <p className="mt-0.5 text-sm text-zinc-500">A dónde se va el tiempo — la base para cobrar bien.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-line bg-white p-0.5 text-sm shadow-soft">
            {(["week", "month", "all"] as Range[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-full px-3 py-1.5 font-medium transition ${range === r ? "bg-ink text-white" : "text-zinc-500"}`}>
                {r === "week" ? "Semana" : r === "month" ? "Mes" : "Todo"}
              </button>
            ))}
          </div>
          <button onClick={() => setShowRates((s) => !s)} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 shadow-soft transition hover:border-zinc-300">
            <Settings2 size={15} /> Tarifas
          </button>
          <button onClick={exportCSV} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 shadow-soft transition hover:border-zinc-300">
            <Download size={15} /> CSV
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white transition hover:bg-ink-soft">
            <Printer size={15} /> PDF
          </button>
        </div>
      </div>

      {/* Editor de tarifas */}
      {showRates && (
        <div className="rounded-2xl border border-line bg-white p-5 shadow-soft print:hidden">
          <h3 className="mb-1 font-display font-bold text-ink">Tarifas por hora (MXN)</h3>
          <p className="mb-4 text-sm text-zinc-500">Para estimar el costo del tiempo. Se guardan en este dispositivo.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="font-medium text-zinc-600">Default</span>
              <input type="number" min={0} value={rates.default || ""} onChange={(e) => setDefault(Number(e.target.value))} className="w-24 rounded-lg border border-line px-2 py-1 text-right tabular outline-none focus:border-curva-purple" placeholder="0" />
            </label>
            {members.filter((m) => m.name && m.name !== "—").map((m) => (
              <label key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                <span className="truncate font-medium text-zinc-600">{m.name}</span>
                <input type="number" min={0} value={rates.byPerson[m.name] || ""} onChange={(e) => setPerson(m.name, Number(e.target.value))} className="w-24 rounded-lg border border-line px-2 py-1 text-right tabular outline-none focus:border-curva-purple" placeholder={String(rates.default || 0)} />
              </label>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-white py-16 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" /> Cargando registros…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-zinc-400">
          No hay registros en este rango. Dale play a una tarea para empezar a medir.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi icon={<Clock size={18} />} label="Tiempo total" value={formatHours(totalMin * 60)} />
            <Kpi icon={<Building2 size={18} />} label="Cliente más demandante" value={topClient ? formatHours(topClient.minutes * 60) : "—"} sub={topClient?.label} />
            <Kpi icon={<Wallet size={18} />} label="Costo del tiempo" value={showCost ? money(totalCost) : "Setea tarifas"} sub={showCost ? undefined : "para ver costo"} />
          </div>

          {/* Por tipo de entregable */}
          <Section icon={<TrendingUp size={20} />} title="Por tipo de entregable" desc="Tu tabulador: cuántas horas cuesta cada tipo de trabajo.">
            <Bars items={byType} totalMin={totalMin} showCost={showCost} icon />
          </Section>

          <div className="grid gap-6 md:grid-cols-2">
            <Section icon={<Building2 size={20} />} title="Por cliente" desc="Costo real en horas por cuenta.">
              <Bars items={byClient} totalMin={totalMin} showCost={showCost} gradient />
            </Section>
            <Section icon={<Tag size={20} />} title="Por proyecto" desc="Dónde se concentra el esfuerzo.">
              <Bars items={byProject} totalMin={totalMin} showCost={showCost} gradient />
            </Section>
          </div>

          <Section icon={<User size={20} />} title="Por persona" desc="Distribución de la carga del equipo.">
            <Bars items={byPerson} totalMin={totalMin} showCost={showCost} />
          </Section>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-soft">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-400">{icon}{label}</p>
      <p className="tabular mt-1 font-display text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-0.5 truncate text-sm text-zinc-500">{sub}</p>}
    </div>
  );
}

function Section({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-6 shadow-soft">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">{icon}{title}</h2>
      <p className="mb-5 text-sm text-zinc-500">{desc}</p>
      {children}
    </section>
  );
}

function Bars({ items, totalMin, showCost, icon, gradient }: { items: { key: string; label: string; minutes: number; cost: number; color?: string }[]; totalMin: number; showCost: boolean; icon?: boolean; gradient?: boolean }) {
  const max = Math.max(...items.map((i) => i.minutes), 1);
  return (
    <div className="space-y-4">
      {items.map((r) => (
        <div key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-ink">
              {icon && (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-white" style={{ background: r.color }}>
                  <TypeIcon typeId={r.key} size={12} />
                </span>
              )}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="shrink-0 text-zinc-500">
              <span className="tabular font-semibold text-ink">{formatHours(r.minutes * 60)}</span>
              {showCost && <span className="tabular ml-2 text-curva-teal">{money(r.cost)}</span>}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
            <div className={`h-full rounded-full ${gradient ? "curva-gradient" : ""}`} style={{ width: `${(r.minutes / max) * 100}%`, background: gradient ? undefined : r.color || "var(--color-curva-purple)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
