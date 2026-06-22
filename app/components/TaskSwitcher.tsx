"use client";

import { Play, Pause, X, Sparkles, Hand, ArrowDownLeft } from "lucide-react";
import { useApp, useLiveElapsed } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatClock } from "@/lib/format";

export function TaskSwitcher() {
  const { openTasks, active, aiActive } = useApp();

  if (openTasks.length === 0) return null;

  const manualId = active?.taskId ?? null;
  const aiIds = aiActive.map((a) => a.taskId);
  const aiSet = new Set(aiIds);
  const pausedIds = openTasks.filter((t) => t !== manualId && !aiSet.has(t));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:pb-4">
      <div className="pointer-events-auto mx-auto max-w-3xl overflow-hidden rounded-[26px] border border-line bg-white/92 shadow-float backdrop-blur-xl">
        {/* ── Zona: A MANO (tu cronómetro, uno a la vez) ── */}
        <div className="p-2.5">
          {manualId ? (
            <ManualRow taskId={manualId} />
          ) : (
            <IdleRow hasAI={aiIds.length > 0} />
          )}
        </div>

        {/* ── Zona: IA EN PARALELO ── */}
        {aiIds.length > 0 && (
          <Lane
            label={
              <span className="inline-flex items-center gap-1.5 text-curva-indigo">
                <Sparkles size={12} className="curva-live-dot" /> IA en paralelo
                <span className="rounded-full bg-curva-indigo/10 px-1.5 py-px text-[10px] font-bold">
                  {aiIds.length}
                </span>
              </span>
            }
            tint="ai"
          >
            {aiIds.map((id) => (
              <AiChip key={id} taskId={id} />
            ))}
          </Lane>
        )}

        {/* ── Zona: EN PAUSA ── */}
        {pausedIds.length > 0 && (
          <Lane label={<span className="text-zinc-400">En pausa</span>}>
            {pausedIds.map((id) => (
              <PausedChip key={id} taskId={id} />
            ))}
          </Lane>
        )}
      </div>
    </div>
  );
}

/* Etiqueta + carril horizontal scrollable, separado por un hairline ("se corta"). */
function Lane({
  label,
  children,
  tint,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  tint?: "ai";
}) {
  return (
    <div className={`border-t border-line/70 px-2.5 py-2 ${tint === "ai" ? "ai-surface" : ""}`}>
      <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.14em]">{label}</p>
      <div className="flex gap-2 overflow-x-auto pb-0.5">{children}</div>
    </div>
  );
}

/* ── Fila principal: la tarea que trabajas A MANO ── */
function ManualRow({ taskId }: { taskId: string }) {
  const { pause, toggleAI, closeTask, autoResumed } = useApp();
  const elapsed = useLiveElapsed(taskId);
  const { taskById, clientById, projectById } = useData();
  const task = taskById[taskId];
  const project = task ? projectById[task.projectId] : undefined;
  const client = project ? clientById[project.clientId] : undefined;
  const justResumed = autoResumed === taskId;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-[18px] border border-curva-purple/30 bg-curva-purple/[0.06] px-3 py-2.5 ${
        justResumed ? "curva-handoff" : ""
      }`}
    >
      <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-curva-purple px-2.5 text-[10px] font-bold uppercase tracking-wide text-white">
        <Hand size={12} /> A mano
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{task?.name || "Tarea"}</p>
        <p className="truncate text-xs text-zinc-500">
          {client?.name ? `${client.name} · ` : ""}
          <span className="tabular font-semibold text-curva-purple">{formatClock(elapsed)}</span>
        </p>
      </div>
      {/* Pasar esta tarea a la IA (y saltar solo a la siguiente) */}
      <button
        onClick={() => toggleAI(taskId)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-curva-indigo/30 bg-white px-3 text-xs font-bold text-curva-indigo transition hover:bg-curva-indigo hover:text-white focus-ring"
        title="Pasarla a la IA y seguir a mano con la siguiente"
      >
        <Sparkles size={14} /> <span className="hidden sm:inline">A la IA</span>
      </button>
      <button
        onClick={pause}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-curva-purple text-white transition hover:opacity-90 focus-ring"
        aria-label="Pausar"
        title="Pausar (Espacio)"
      >
        <Pause size={15} fill="currentColor" />
      </button>
      <button
        onClick={() => closeTask(taskId)}
        className="shrink-0 rounded-md p-1 text-zinc-300 transition hover:bg-zinc-100 hover:text-zinc-500"
        aria-label="Cerrar"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* Estado vacío de la zona "a mano" (cuando solo hay IA o pausa). */
function IdleRow({ hasAI }: { hasAI: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[18px] border border-dashed border-line px-3 py-2.5">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
        <Hand size={15} />
      </span>
      <p className="text-xs text-zinc-500">
        Nada a mano ahora.{" "}
        {hasAI ? "La IA sigue trabajando ✨ — toma una tarea para retomar." : "Toca ▶ en una tarea."}
      </p>
    </div>
  );
}

/* ── Chip de tarea que está resolviendo la IA ── */
function AiChip({ taskId }: { taskId: string }) {
  const { switchTo, stopAI } = useApp();
  const elapsed = useLiveElapsed(taskId);
  const { taskById } = useData();
  const task = taskById[taskId];

  return (
    <div className="dock-in ai-shimmer group flex min-w-[180px] shrink-0 items-center gap-2 rounded-xl border border-curva-indigo/30 bg-white/70 px-2.5 py-2">
      <Sparkles size={15} className="curva-live-dot shrink-0 text-curva-indigo" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-ink">{task?.name || "Tarea"}</p>
        <p className="tabular text-xs font-semibold text-curva-indigo">{formatClock(elapsed)}</p>
      </div>
      {/* Retomar a mano */}
      <button
        onClick={() => switchTo(taskId)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink text-white transition hover:bg-curva-purple focus-ring"
        aria-label="Retomar a mano"
        title="Retomar a mano (quita la IA)"
      >
        <ArrowDownLeft size={13} />
      </button>
      {/* Detener IA */}
      <button
        onClick={() => stopAI(taskId)}
        className="shrink-0 rounded-md p-1 text-curva-indigo/50 opacity-0 transition hover:text-curva-indigo group-hover:opacity-100"
        aria-label="Detener IA"
        title="Detener IA"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ── Chip de tarea abierta pero en pausa ── */
function PausedChip({ taskId }: { taskId: string }) {
  const { switchTo, toggleAI, closeTask } = useApp();
  const { taskById } = useData();
  const task = taskById[taskId];

  return (
    <div className="group flex min-w-[150px] shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white px-2 py-1.5">
      <button
        onClick={() => switchTo(taskId)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink text-white transition hover:bg-curva-purple focus-ring"
        aria-label="Trabajar a mano"
        title="Trabajar a mano"
      >
        <Play size={12} fill="currentColor" />
      </button>
      <button onClick={() => switchTo(taskId)} className="min-w-0 flex-1 truncate text-left text-xs font-medium text-ink">
        {task?.name || "Tarea"}
      </button>
      <button
        onClick={() => toggleAI(taskId)}
        className="shrink-0 rounded-md p-1 text-zinc-300 transition hover:text-curva-indigo"
        aria-label="Pasar a la IA"
        title="Pasar a la IA"
      >
        <Sparkles size={13} />
      </button>
      <button
        onClick={() => closeTask(taskId)}
        className="shrink-0 rounded-md p-1 text-zinc-300 opacity-0 transition hover:text-zinc-500 group-hover:opacity-100"
        aria-label="Cerrar"
      >
        <X size={13} />
      </button>
    </div>
  );
}
