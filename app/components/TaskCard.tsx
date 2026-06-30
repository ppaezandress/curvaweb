"use client";

import { useState } from "react";
import { Play, Pause, Plus, Layers, Check, CircleCheck, Camera, Sparkles, ExternalLink, RotateCcw } from "lucide-react";
import { useApp, useLiveElapsed } from "@/lib/app-context";
import { statusToneClass, type Task } from "@/lib/mock-data";
import { useData } from "@/lib/data-context";
import { useCelebrate } from "@/lib/celebrate-context";
import { formatClock, formatDuration } from "@/lib/format";
import { isDone as isDoneStatus } from "@/lib/task-status";
import { openInNotion } from "@/lib/notion-url";
import { Avatar } from "@/components/Avatar";
import { TypeIcon } from "@/components/TypeIcon";
import { TaskPhotos } from "@/components/TaskPhotos";
import { TaskDetailDrawer } from "@/components/TaskDetailDrawer";

export function TaskCard({ task }: { task: Task }) {
  const { active, switchTo, pause, openTask, openTasks, sessionSecondsForTask, toggleAI, isAI, autoResumed, aiEnabled } = useApp();
  const elapsed = useLiveElapsed(task.id);
  const { memberById, taskTypeById, reload } = useData();
  const { celebrate } = useCelebrate();
  const [marking, setMarking] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const isRunning = active?.taskId === task.id;
  const onAI = isAI(task.id); // la IA está resolviendo esta tarea (en paralelo)
  const isOpen = openTasks.includes(task.id);
  const done = isDoneStatus(task.status);

  const markDone = async () => {
    if (marking || done) return;
    setMarking(true);
    try {
      if (isRunning) pause();
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, status: "DONE" }),
      });
      celebrate(task.id, task.name);
      await reload();
    } finally {
      setMarking(false);
    }
  };

  // Reabrir una tarea terminada por error (Done → En curso). El backend acepta cualquier status.
  const reopen = async () => {
    if (marking) return;
    setMarking(true);
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, status: "EN CURSO" }),
      });
      await reload();
    } finally {
      setMarking(false);
    }
  };

  // Iniciar el cronómetro + mover el estatus a "EN CURSO" si estaba sin empezar.
  const start = async () => {
    switchTo(task.id);
    const s = (task.status || "").toLowerCase();
    if (!done && !/curso|progress|haciendo/.test(s)) {
      try {
        await fetch("/api/tasks", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: task.id, status: "EN CURSO" }),
        });
        await reload();
      } catch { /* el cronómetro ya corre; el estatus se reintenta luego */ }
    }
  };

  const type = taskTypeById[task.typeId];
  // TODOS los asignados (responsables + auxiliares), no solo el primero.
  const assigneeIds = [...new Set([
    ...(task.responsableIds?.length ? task.responsableIds : task.responsableId ? [task.responsableId] : []),
    ...(task.auxiliarIds?.length ? task.auxiliarIds : task.auxiliarId ? [task.auxiliarId] : []),
  ])];
  const assignees = assigneeIds.map((id) => memberById[id]).filter(Boolean);

  const total =
    task.baselineSeconds +
    sessionSecondsForTask(task.id) +
    (isRunning || onAI ? elapsed : 0);

  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border bg-surface p-4 transition ${
        isRunning
          ? "border-accent shadow-lg shadow-accent/10"
          : onAI
            ? "border-curva-indigo shadow-lg shadow-curva-indigo/10"
            : "border-line hover:border-zinc-300"
      } ${autoResumed === task.id ? "curva-handoff" : ""}`}
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
          <span className="text-xs font-semibold text-muted">{type?.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusToneClass(task.status)}`}>
            {task.status}
          </span>
          {task.internal && (
            <span className="rounded-full bg-curva-teal/10 px-2 py-0.5 text-[11px] font-semibold text-curva-teal">Interno</span>
          )}
          {task.weight && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">{task.weight}</span>
          )}
        </div>
        <button onClick={() => setShowDetail(true)} className="block max-w-full truncate text-left font-display font-semibold text-fg transition hover:text-accent focus-ring rounded" title="Ver detalle e historial">{task.name}</button>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex items-center -space-x-1.5">
            {assignees.slice(0, 4).map((m) => <Avatar key={m!.id} member={m!} size={20} />)}
            {assignees.length > 4 && <span className="ml-2.5 text-xs font-medium text-muted">+{assignees.length - 4}</span>}
          </span>
          <span className="tabular text-sm text-muted">{formatDuration(total)}</span>
          {onAI ? (
            <span className="ai-shimmer inline-flex items-center gap-1 rounded-full bg-curva-indigo/10 px-2 py-0.5 text-[11px] font-semibold text-curva-indigo">
              <Sparkles size={11} className="curva-live-dot" /> IA · {formatClock(elapsed)}
            </span>
          ) : (
            isOpen && !isRunning && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                <Layers size={11} /> en pausa
              </span>
            )
          )}
        </div>
      </div>

      {/* Acción */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Abrir en Notion (app de escritorio si la tienes, si no web) */}
        <button
          onClick={() => openInNotion(task.id)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:border-accent hover:text-accent focus-ring"
          aria-label="Abrir en Notion"
          title="Abrir en Notion (app o web)"
        >
          <ExternalLink size={15} />
        </button>
        {/* Fotos de la tarea (en cualquier momento) */}
        <button
          onClick={() => setShowPhotos(true)}
          className="hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:border-accent hover:text-accent focus-ring sm:inline-flex"
          aria-label="Fotos de la tarea"
          title="Fotos de la tarea"
        >
          <Camera size={15} />
        </button>
        {/* Terminar la tarea (marca Done; pausa el reloj internamente) */}
        {!done && (
          <button
            onClick={markDone}
            disabled={marking}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold text-muted transition hover:border-emerald-500 hover:text-emerald-500 disabled:opacity-40 focus-ring"
            aria-label="Terminar tarea"
            title="Terminar (marcar como Done)"
          >
            <CircleCheck size={16} /> <span className="hidden sm:inline">Terminar</span>
          </button>
        )}
        {done && (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <Check size={12} /> Done
            </span>
            <button
              onClick={reopen}
              disabled={marking}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium text-muted transition hover:border-accent hover:text-accent disabled:opacity-40 focus-ring"
              aria-label="Reabrir tarea"
              title="Reabrir (volver a En curso)"
            >
              <RotateCcw size={14} /> <span className="hidden sm:inline">Reabrir</span>
            </button>
          </>
        )}
        {/* Abrir en barra sin arrancar (solo si no está abierta) */}
        {!isOpen && !done && (
          <button
            onClick={() => openTask(task.id)}
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:border-accent hover:text-accent sm:inline-flex focus-ring"
            aria-label="Agregar a pestañas"
            title="Agregar a pestañas (sin arrancar)"
          >
            <Plus size={15} />
          </button>
        )}
        {/* La IA está trabajando (corre en paralelo a tu reloj manual de otra tarea) */}
        {!done && aiEnabled && (
          <button
            onClick={() => toggleAI(task.id)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition focus-ring ${
              onAI
                ? "border-curva-indigo bg-curva-indigo text-white shadow-sm shadow-curva-indigo/20"
                : "border-line bg-surface text-muted hover:border-curva-indigo hover:text-curva-indigo"
            }`}
            aria-label={onAI ? "Detener IA" : "Pasar a la IA"}
            title={onAI ? "La IA está trabajando — toca para detener" : "Pásala a la IA y sigue a mano con la siguiente"}
          >
            <Sparkles size={15} className={onAI ? "curva-live-dot" : ""} />
            <span className="hidden sm:inline">IA</span>
          </button>
        )}
        {!done && isRunning && (
          <button
            onClick={pause}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-ring"
          >
            <span className="tabular tracking-tight">{formatClock(elapsed)}</span>
            <Pause size={14} fill="currentColor" />
          </button>
        )}
        {!done && !isRunning && (
          <button
            onClick={start}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition hover:border-accent hover:text-accent focus-ring"
            aria-label={`Iniciar ${task.name}`}
          >
            <Play size={14} fill="currentColor" /> {isOpen ? "Reanudar" : "Iniciar"}
          </button>
        )}
      </div>

      <TaskPhotos taskId={task.id} taskName={task.name} open={showPhotos} onClose={() => setShowPhotos(false)} />
      <TaskDetailDrawer taskId={task.id} open={showDetail} onClose={() => setShowDetail(false)} />
    </div>
  );
}
