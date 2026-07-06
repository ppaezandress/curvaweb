"use client";

import { Pause, Play, Clock } from "lucide-react";
import { useApp, useLiveElapsed } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatClock, formatDuration } from "@/lib/format";

export function NowHero({
  assignedCount,
  runningCount,
}: {
  assignedCount: number;
  runningCount: number;
}) {
  const { active, stop, loggedSecondsToday, focusApp, sessionSecondsForTask } = useApp();
  const elapsed = useLiveElapsed();
  const { taskById, clientById, projectById } = useData();

  const focusStyle =
    focusApp?.tone === "work"
      ? "bg-surface/20 text-white"
      : focusApp?.tone === "distraction"
        ? "bg-danger/90 text-white"
        : "bg-surface/10 text-white/80";

  if (active) {
    const task = taskById[active.taskId];
    const client = task ? clientById[task.clientId] : undefined;
    const project = task ? projectById[task.projectId] : undefined;
    // Total REAL acumulado en la tarea: lo previo (Notion) + sesiones cerradas + esta corrida en vivo.
    // Es el número que crece y nunca reinicia al pausar/reanudar.
    const totalLive = (task?.baselineSeconds ?? 0) + sessionSecondsForTask(active.taskId) + elapsed;
    return (
      <div className="curva-gradient overflow-hidden rounded-hero p-6 text-white sm:p-8">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <span className="curva-live-dot inline-block h-2.5 w-2.5 rounded-full bg-surface" />
          Cronómetro corriendo
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-semibold sm:text-2xl">
              {task?.name}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {client?.name} · {project?.name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-caption font-medium text-white/60">
              Total en esta tarea
            </p>
            <p className="tabular font-display text-4xl font-bold leading-none sm:text-5xl">
              {formatClock(totalLive)}
            </p>
            <p className="mt-1.5 text-sm text-white/70">
              Esta sesión: <span className="tabular">{formatClock(elapsed)}</span>
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={stop}
            className="focus-ring inline-flex items-center gap-2 rounded-control bg-surface px-5 py-2.5 text-sm font-bold text-fg transition hover:bg-surface/90 active:scale-[0.98]"
          >
            <Pause size={16} fill="currentColor" /> Detener y guardar
          </button>
          {focusApp && (
            <span className={`inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-caption font-medium ${focusStyle}`}>
              En foco: {focusApp.label}
              {focusApp.tone === "distraction" && " · ¿distracción?"}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-hero border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-accent/10 text-accent">
            <Play size={20} fill="currentColor" />
          </span>
          <div>
            <p className="font-display text-lg font-bold text-fg">
              No tienes nada corriendo
            </p>
            <p className="text-sm text-muted">
              Elige una tarea abajo y dale <span className="font-semibold text-fg">Iniciar</span>.
            </p>
          </div>
        </div>
        <div className="flex gap-6">
          <Metric icon={<Clock size={15} />} label="Registrado hoy" value={formatDuration(loggedSecondsToday)} />
          <Metric label="Asignadas" value={String(assignedCount)} />
          <Metric label="En curso" value={String(runningCount)} />
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-caption font-medium text-muted">
        {icon}
        {label}
      </p>
      <p className="tabular font-display text-2xl font-bold text-fg">{value}</p>
    </div>
  );
}
