"use client";

import { Clock, TrendingUp, Wallet, Tag } from "lucide-react";
import { useApp } from "@/lib/app-context";
import {
  members,
  projectById,
  tasks,
  taskTypes,
  clientById,
} from "@/lib/mock-data";
import { formatHours } from "@/lib/format";
import { TypeIcon } from "@/components/TypeIcon";

export default function ReportesPage() {
  const { sessionSecondsForTask } = useApp();

  const taskTotal = (taskId: string, baseline: number) =>
    baseline + sessionSecondsForTask(taskId);

  // Por tipo de entregable (ángulo de pricing)
  const byType = taskTypes
    .map((type) => {
      const ts = tasks.filter((t) => t.typeId === type.id);
      const seconds = ts.reduce((a, t) => a + taskTotal(t.id, t.baselineSeconds), 0);
      const worked = ts.filter((t) => taskTotal(t.id, t.baselineSeconds) > 0);
      const avg = worked.length ? seconds / worked.length : 0;
      return { type, seconds, avg, count: worked.length };
    })
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  const byProject = Object.values(projectById)
    .map((p) => ({
      project: p,
      seconds: tasks
        .filter((t) => t.projectId === p.id)
        .reduce((a, t) => a + taskTotal(t.id, t.baselineSeconds), 0),
    }))
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  const byPerson = members
    .map((m) => ({
      member: m,
      seconds: tasks
        .filter((t) => t.responsableId === m.id)
        .reduce((a, t) => a + taskTotal(t.id, t.baselineSeconds), 0),
    }))
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  const totalSeconds = byProject.reduce((a, r) => a + r.seconds, 0);
  const topProject = byProject[0];
  const topType = [...byType].sort((a, b) => b.avg - a.avg)[0];

  const maxType = Math.max(...byType.map((r) => r.seconds), 1);
  const maxProject = Math.max(...byProject.map((r) => r.seconds), 1);
  const maxPerson = Math.max(...byPerson.map((r) => r.seconds), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Reportes</h1>
        <p className="mt-1 text-zinc-500">
          A dónde se va el tiempo del equipo — la base para cobrar bien.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          icon={<Clock size={18} />}
          label="Tiempo total medido"
          value={formatHours(totalSeconds)}
        />
        <Kpi
          icon={<Wallet size={18} />}
          label="Proyecto más caro"
          value={topProject ? formatHours(topProject.seconds) : "—"}
          sub={topProject?.project.name}
        />
        <Kpi
          icon={<Tag size={18} />}
          label="Entregable más costoso"
          value={topType ? `${formatHours(topType.avg)}/tarea` : "—"}
          sub={topType?.type.label}
        />
      </div>

      <div className="rounded-2xl border border-curva-indigo/30 bg-curva-indigo/5 p-4 text-sm text-curva-indigo">
        Datos de demostración. Cuando conectemos Notion, saldrán del historial real del equipo.
      </div>

      {/* Por tipo de entregable */}
      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
          <TrendingUp size={20} /> Por tipo de entregable
        </h2>
        <p className="mb-5 text-sm text-zinc-500">
          Tu tabulador de precios: cuántas horas cuesta, en promedio, cada tipo de trabajo.
        </p>
        <div className="space-y-4">
          {byType.map((r) => (
            <div key={r.type.id}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-white"
                    style={{ background: r.type.color }}
                  >
                    <TypeIcon typeId={r.type.id} size={12} />
                  </span>
                  {r.type.label}
                </span>
                <span className="text-zinc-500">
                  <span className="tabular font-semibold text-ink">{formatHours(r.seconds)}</span>{" "}
                  · prom. {formatHours(r.avg)}/tarea
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(r.seconds / maxType) * 100}%`, background: r.type.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Por proyecto */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
            <Wallet size={20} /> Por proyecto
          </h2>
          <p className="mb-5 text-sm text-zinc-500">Costo real en horas (rentabilidad).</p>
          <div className="space-y-4">
            {byProject.map((r) => (
              <div key={r.project.id}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="min-w-0 truncate font-medium text-ink">{r.project.name}</span>
                  <span className="tabular ml-2 shrink-0 font-semibold text-ink">
                    {formatHours(r.seconds)}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="curva-gradient h-full rounded-full"
                    style={{ width: `${(r.seconds / maxProject) * 100}%` }}
                  />
                </div>
                <p className="mt-0.5 text-xs text-zinc-400">{clientById[r.project.clientId]?.name}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Por persona */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
            <Clock size={20} /> Por persona
          </h2>
          <p className="mb-5 text-sm text-zinc-500">Distribución de la carga del equipo.</p>
          <div className="space-y-4">
            {byPerson.map((r) => (
              <div key={r.member.id}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium text-ink">{r.member.name}</span>
                  <span className="tabular font-semibold text-ink">{formatHours(r.seconds)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(r.seconds / maxPerson) * 100}%`, background: r.member.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-400">
        {icon}
        {label}
      </p>
      <p className="tabular mt-1 font-display text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-0.5 truncate text-sm text-zinc-500">{sub}</p>}
    </div>
  );
}
