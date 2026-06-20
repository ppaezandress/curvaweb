"use client";

import { Play, Pause, X } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatClock } from "@/lib/format";

export function TaskSwitcher() {
  const { openTasks, active, elapsed, switchTo, pause, closeTask, sessionSecondsForTask } = useApp();
  const { taskById, clientById, projectById } = useData();

  if (openTasks.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:pb-4">
      <div className="pointer-events-auto mx-auto max-w-5xl rounded-2xl border border-line bg-white/95 p-2 shadow-float backdrop-blur">
        <div className="mb-1.5 flex items-center justify-between px-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            {active ? "Trabajando en" : "En pausa"} · {openTasks.length} {openTasks.length === 1 ? "tarea" : "tareas"}
          </p>
          {active && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-curva-purple">
              <span className="curva-live-dot inline-block h-2 w-2 rounded-full bg-curva-purple" />
              en vivo
            </span>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {openTasks.map((taskId, i) => {
            const task = taskById[taskId];
            const isActive = active?.taskId === taskId;
            const secs = sessionSecondsForTask(taskId) + (isActive ? elapsed : 0);
            const project = task ? projectById[task.projectId] : undefined;
            const client = project ? clientById[project.clientId] : undefined;

            return (
              <div
                key={taskId}
                className={`group relative flex min-w-[190px] max-w-[260px] shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 transition ${
                  isActive
                    ? "border-curva-purple bg-curva-purple/5 shadow-sm"
                    : "border-line bg-white hover:border-zinc-300"
                }`}
              >
                <button
                  onClick={() => (isActive ? pause() : switchTo(taskId))}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition ${
                    isActive ? "bg-curva-purple" : "bg-ink hover:bg-ink-soft"
                  }`}
                  aria-label={isActive ? "Pausar" : "Cambiar a esta tarea"}
                  title={isActive ? "Pausar (Espacio)" : `Cambiar (tecla ${i + 1})`}
                >
                  {isActive ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                </button>

                <button onClick={() => switchTo(taskId)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-xs font-semibold text-ink">{task?.name || "Tarea"}</p>
                  <p className="tabular text-xs text-zinc-500">
                    {client?.name ? `${client.name} · ` : ""}
                    <span className={isActive ? "font-semibold text-curva-purple" : ""}>{formatClock(secs)}</span>
                  </p>
                </button>

                <button
                  onClick={() => closeTask(taskId)}
                  className="shrink-0 rounded-md p-1 text-zinc-300 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-500 group-hover:opacity-100"
                  aria-label="Cerrar pestaña"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
