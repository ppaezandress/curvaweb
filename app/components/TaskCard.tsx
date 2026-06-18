"use client";

import { Play, Pause } from "lucide-react";
import { useApp } from "@/lib/app-context";
import {
  memberById,
  statusTone,
  taskTypeById,
  type Task,
} from "@/lib/mock-data";
import { formatClock, formatDuration } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { TypeIcon } from "@/components/TypeIcon";

export function TaskCard({ task }: { task: Task }) {
  const { active, elapsed, start, stop, sessionSecondsForTask } = useApp();
  const isRunning = active?.taskId === task.id;

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
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone[task.status]}`}>
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
        </div>
      </div>

      {/* Acción */}
      {isRunning ? (
        <button
          onClick={stop}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-soft"
        >
          <span className="tabular tracking-tight">{formatClock(elapsed)}</span>
          <Pause size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          onClick={() => start(task.id)}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-curva-purple hover:text-curva-purple"
          aria-label={`Iniciar ${task.name}`}
        >
          <Play size={14} fill="currentColor" /> Iniciar
        </button>
      )}
    </div>
  );
}
