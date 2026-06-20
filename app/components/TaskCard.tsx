"use client";

import { Play, Pause, Plus, Layers } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { statusToneClass, type Task } from "@/lib/mock-data";
import { useData } from "@/lib/data-context";
import { formatClock, formatDuration } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { TypeIcon } from "@/components/TypeIcon";

export function TaskCard({ task }: { task: Task }) {
  const { active, elapsed, switchTo, pause, openTask, openTasks, sessionSecondsForTask } = useApp();
  const { memberById, taskTypeById } = useData();
  const isRunning = active?.taskId === task.id;
  const isOpen = openTasks.includes(task.id);

  const type = taskTypeById[task.typeId];
  const responsable = memberById[task.responsableId];
  const auxiliar = task.auxiliarId ? memberById[task.auxiliarId] : undefined;

  const total =
    task.baselineSeconds +
    sessionSecondsForTask(task.id) +
    (isRunning ? elapsed : 0);

  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border bg-white p-4 transition ${
        isRunning
          ? "border-curva-purple shadow-lg shadow-curva-purple/10"
          : "border-line hover:border-zinc-300"
      }`}
    >
      {/* Ícono de tipo */}
      <span
        className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white sm:flex"
        style={{ background: type?.color }}
      >
        <TypeIcon typeId={task.typeId} size={20} />
      </span>

      {/* Contenido */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-zinc-500">{type?.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusToneClass(task.status)}`}>
            {task.status}
          </span>
        </div>
        <h3 className="truncate font-display font-semibold text-ink">{task.name}</h3>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex -space-x-1.5">
            {responsable && <Avatar member={responsable} size={20} />}
            {auxiliar && <Avatar member={auxiliar} size={20} />}
          </span>
          <span className="tabular text-sm text-zinc-500">{formatDuration(total)}</span>
          {isOpen && !isRunning && (
            <span className="inline-flex items-center gap-1 rounded-full bg-curva-purple/10 px-2 py-0.5 text-[11px] font-medium text-curva-purple">
              <Layers size={11} /> en pausa
            </span>
          )}
        </div>
      </div>

      {/* Acción */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Abrir en barra sin arrancar (solo si no está abierta) */}
        {!isOpen && (
          <button
            onClick={() => openTask(task.id)}
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-zinc-400 transition hover:border-curva-purple hover:text-curva-purple sm:inline-flex"
            aria-label="Agregar a pestañas"
            title="Agregar a pestañas (sin arrancar)"
          >
            <Plus size={15} />
          </button>
        )}
        {isRunning ? (
          <button
            onClick={pause}
            className="inline-flex items-center gap-2 rounded-full bg-curva-purple px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <span className="tabular tracking-tight">{formatClock(elapsed)}</span>
            <Pause size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={() => switchTo(task.id)}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-curva-purple hover:text-curva-purple"
            aria-label={`Iniciar ${task.name}`}
          >
            <Play size={14} fill="currentColor" /> {isOpen ? "Reanudar" : "Iniciar"}
          </button>
        )}
      </div>
    </div>
  );
}
