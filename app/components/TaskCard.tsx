"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Play, Pause, Plus, Layers, Check, CircleCheck, Camera, Sparkles, ExternalLink, RotateCcw, Clock, CalendarClock } from "lucide-react";
import { DUR_BASE, EASE_CURVA, SPRING_SNAPPY } from "@/lib/motion";
import { useApp, useLiveElapsed } from "@/lib/app-context";
import { type Task } from "@/lib/mock-data";
import { useData } from "@/lib/data-context";
import { useCelebrate } from "@/lib/celebrate-context";
import { formatClock, formatDuration } from "@/lib/format";
import { dueDateMs, dueDateLabel } from "@/lib/date";
import { isDone as isDoneStatus } from "@/lib/task-status";
import { openInNotion } from "@/lib/notion-url";
import { Avatar } from "@/components/Avatar";
import { StatusPicker } from "@/components/StatusPicker";
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
    // Congela el total AHORA (antes de pause()/reload()): pause() puede mandar el
    // tramo a revisión y reload() lo reconcilia contra Notion, dos caminos que lo
    // vaciarían de sessionSecondsForTask antes de tiempo. El modal debe mostrar lo
    // que la tarjeta ya muestra en este instante.
    const totalAtDone = total;
    try {
      if (isRunning) pause();
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, status: "DONE" }),
      });
      celebrate(task.id, task.name, totalAtDone);
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

  // Chip de vencimiento (fecha corregida por zona horaria). Tono por urgencia.
  const due = (() => {
    const ms = dueDateMs(task.dueDate);
    if (ms == null) return null;
    const today0 = new Date().setHours(0, 0, 0, 0);
    const days = Math.round((ms - today0) / 86_400_000);
    const label = dueDateLabel(task.dueDate);
    const short = days < 0 ? `Venció ${label}` : days === 0 ? "Hoy" : days === 1 ? "Mañana" : label;
    const tone = days < 0 ? "bg-danger/10 text-danger"
      : days === 0 ? "bg-warn/10 text-warn"
      : days <= 7 ? "bg-accent/10 text-accent"
      : "bg-surface-2 text-muted";
    return { label, short, tone };
  })();

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ layout: SPRING_SNAPPY, opacity: { duration: DUR_BASE }, y: { duration: DUR_BASE, ease: EASE_CURVA }, scale: { duration: DUR_BASE } }}
      className={`flex items-center gap-4 rounded-card border p-4 transition-colors ${
        isRunning
          ? "border-accent bg-accent/[0.04]"
          : onAI
            ? "border-accent ai-surface"
            : "border-line bg-surface hover:border-muted/40"
      } ${autoResumed === task.id ? "curva-handoff" : ""}`}
    >
      {/* Ícono de tipo */}
      <span
        className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-control text-white sm:flex"
        style={{ background: type?.color }}
      >
        <TypeIcon typeId={task.typeId} size={20} />
      </span>

      {/* Contenido */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">{type?.label}</span>
          <StatusPicker taskId={task.id} status={task.status} onChanged={reload} />
          {task.internal && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-caption font-semibold text-success">Interno</span>
          )}
          {task.weight && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-caption font-medium text-muted">{task.weight}</span>
          )}
        </div>
        <button onClick={() => setShowDetail(true)} className="block max-w-full truncate text-left font-display font-semibold text-fg transition hover:text-accent focus-ring rounded" title="Ver detalle e historial">{task.name}</button>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex items-center -space-x-1.5">
            {assignees.slice(0, 4).map((m) => <Avatar key={m!.id} member={m!} size={20} />)}
            {assignees.length > 4 && <span className="ml-2.5 text-xs font-medium text-muted">+{assignees.length - 4}</span>}
          </span>
          <span className="tabular inline-flex items-center gap-1 text-sm text-muted" title="Tiempo total acumulado en esta tarea">
            <Clock size={13} /> {formatDuration(total)}
          </span>
          {due && !done && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold ${due.tone}`} title={`Vence ${due.label}`}>
              <CalendarClock size={11} /> {due.short}
            </span>
          )}
          {onAI ? (
            <span className="ai-shimmer inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-caption font-semibold text-accent">
              <Sparkles size={11} className="curva-live-dot" /> IA · {formatClock(elapsed)}
            </span>
          ) : (
            isOpen && !isRunning && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-caption font-medium text-accent">
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
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:border-accent hover:text-accent focus-ring active:scale-90"
          aria-label="Abrir en Notion"
          title="Abrir en Notion (app o web)"
        >
          <ExternalLink size={15} />
        </button>
        {/* Fotos de la tarea (en cualquier momento) */}
        <button
          onClick={() => setShowPhotos(true)}
          className="hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:border-accent hover:text-accent focus-ring active:scale-90 sm:inline-flex"
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
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-sm font-semibold text-muted transition hover:border-success hover:text-success disabled:opacity-40 focus-ring active:scale-95"
            aria-label="Terminar tarea"
            title="Terminar (marcar como Done)"
          >
            <CircleCheck size={16} /> <span className="hidden sm:inline">Terminar</span>
          </button>
        )}
        {done && (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
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
                ? "border-accent bg-accent text-white shadow-sm shadow-accent/20"
                : "border-line bg-surface text-muted hover:border-accent hover:text-accent"
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
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-ring active:scale-95"
          >
            <span className="tabular tracking-tight">{formatClock(elapsed)}</span>
            <Pause size={14} fill="currentColor" />
          </button>
        )}
        {!done && !isRunning && (
          <button
            onClick={start}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition hover:border-accent hover:text-accent focus-ring active:scale-95"
            aria-label={`Iniciar ${task.name}`}
          >
            <Play size={14} fill="currentColor" /> {isOpen ? "Reanudar" : "Iniciar"}
          </button>
        )}
      </div>

      <TaskPhotos taskId={task.id} taskName={task.name} open={showPhotos} onClose={() => setShowPhotos(false)} />
      <TaskDetailDrawer taskId={task.id} open={showDetail} onClose={() => setShowDetail(false)} />
    </motion.div>
  );
}
