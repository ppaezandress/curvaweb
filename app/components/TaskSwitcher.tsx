"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Play, Pause, X, Sparkles, Hand, ArrowDownLeft, CircleCheck } from "lucide-react";
import { useApp, useLiveElapsed } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { useCoworking } from "@/lib/use-coworking";
import { useCelebrate } from "@/lib/celebrate-context";
import { formatClock } from "@/lib/format";
import { dockChip, SPRING_SNAPPY } from "@/lib/motion";
import { Avatar } from "@/components/Avatar";

export function TaskSwitcher() {
  const { openTasks, active, aiActive, aiEnabled } = useApp();

  const manualId = active?.taskId ?? null;
  const aiIds = aiActive.map((a) => a.taskId);
  const aiSet = new Set(aiIds);
  const pausedIds = openTasks.filter((t) => t !== manualId && !aiSet.has(t));

  // AnimatePresence vive siempre montado (el layout renderiza <TaskSwitcher/> fijo) para
  // poder animar la aparición y la salida del dock cuando openTasks pasa de/hacia 0.
  return (
    <AnimatePresence>
      {openTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={SPRING_SNAPPY}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(56px+env(safe-area-inset-bottom)+12px)] sm:pb-4"
        >
      <motion.div layout className="pointer-events-auto mx-auto max-w-3xl overflow-hidden rounded-hero border border-line bg-surface/92 shadow-float backdrop-blur-xl">
        {/* ── Zona: A MANO (tu cronómetro, uno a la vez) ── */}
        <div className="p-1.5">
          {manualId ? (
            <ManualRow taskId={manualId} />
          ) : (
            <IdleRow hasAI={aiIds.length > 0} />
          )}
        </div>

        {/* ── Zona: IA EN PARALELO ── */}
        {aiEnabled && aiIds.length > 0 && (
          <Lane
            label={
              <span className="inline-flex items-center gap-1.5 text-accent">
                <Sparkles size={12} className="curva-live-dot" /> IA en paralelo
                <span className="rounded-full bg-accent/10 px-1.5 py-px text-caption font-bold">
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
          <Lane label={<span className="text-muted">En pausa</span>}>
            {pausedIds.map((id) => (
              <PausedChip key={id} taskId={id} />
            ))}
          </Lane>
        )}
      </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
    <motion.div layout className={`flex items-center gap-2 border-t border-line/70 px-2.5 py-1.5 ${tint === "ai" ? "ai-surface" : ""}`}>
      <p className="shrink-0 px-0.5 text-caption font-semibold text-muted">{label}</p>
      <div className="flex flex-1 gap-1.5 overflow-x-auto py-0.5">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ── Fila principal: la tarea que trabajas A MANO ── */
function ManualRow({ taskId }: { taskId: string }) {
  const { pause, toggleAI, closeTask, autoResumed, aiEnabled, sessionSecondsForTask } = useApp();
  const { partners } = useCoworking();
  const { celebrate } = useCelebrate();
  const elapsed = useLiveElapsed(taskId);
  const { taskById, clientById, projectById, reload } = useData();
  const task = taskById[taskId];
  const [marking, setMarking] = useState(false);

  // Terminar la tarea directo desde el dock (sin ir a la tarjeta). Pausa + Done.
  const terminar = async () => {
    if (marking) return;
    setMarking(true);
    try {
      pause();
      await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, status: "DONE" }) });
      celebrate(taskId, task?.name || "Tarea");
      await reload();
    } finally { setMarking(false); }
  };
  const totalLive = (task?.baselineSeconds ?? 0) + sessionSecondsForTask(taskId) + elapsed;
  const project = task ? projectById[task.projectId] : undefined;
  const client = project ? clientById[project.clientId] : undefined;
  const justResumed = autoResumed === taskId;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-card border border-accent/30 bg-accent/[0.06] px-3 py-2.5 ${
        justResumed ? "curva-handoff" : ""
      }`}
    >
      <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-2.5 text-caption font-bold text-white">
        <Hand size={12} /> A mano
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{task?.name || "Tarea"}</p>
        <p className="truncate text-xs text-muted">
          {client?.name ? `${client.name} · ` : ""}
          <span className="tabular font-semibold text-accent">{formatClock(totalLive)}</span>
          <span className="tabular text-muted"> · sesión {formatClock(elapsed)}</span>
        </p>
      </div>
      {/* Co-working en vivo: quién más está en ESTA tarea ahora mismo */}
      {partners.length > 0 && (
        <div className="hidden shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 sm:flex" title={`Trabajando juntos: ${partners.map((p) => p.name).join(", ")}`}>
          <span className="flex -space-x-1.5">
            {partners.slice(0, 3).map((p) => (
              <Avatar key={p.uid} name={p.name} src={p.avatarUrl} size={20} />
            ))}
          </span>
          <span className="text-caption font-semibold text-success">
            {partners.length === 1 ? `con ${partners[0].name.split(" ")[0]}` : `con ${partners.length}`}
          </span>
        </div>
      )}
      {/* Pasar esta tarea a la IA (y saltar solo a la siguiente) */}
      {aiEnabled && (
        <button
          onClick={() => toggleAI(taskId)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-accent/30 bg-surface px-3 text-xs font-bold text-accent transition hover:bg-accent hover:text-white focus-ring"
          title="Pasarla a la IA y seguir a mano con la siguiente"
        >
          <Sparkles size={14} /> <span className="hidden sm:inline">A la IA</span>
        </button>
      )}
      <button
        onClick={pause}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition hover:opacity-90 focus-ring"
        aria-label="Pausar"
        title="Pausar (Espacio)"
      >
        <Pause size={15} fill="currentColor" />
      </button>
      <button
        onClick={terminar}
        disabled={marking}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-bold text-muted transition hover:border-success hover:text-success disabled:opacity-40 focus-ring"
        aria-label="Terminar tarea"
        title="Terminar (marcar Done)"
      >
        <CircleCheck size={15} /> <span className="hidden sm:inline">Terminar</span>
      </button>
      <button
        onClick={() => closeTask(taskId)}
        className="shrink-0 rounded-md p-1 text-muted/70 transition hover:bg-surface-2 hover:text-fg"
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
    <div className="flex items-center gap-2 rounded-card border border-dashed border-line px-2.5 py-1.5">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Hand size={12} />
      </span>
      <p className="truncate text-xs text-muted">
        Nada a mano.{" "}
        {hasAI ? "La IA sigue — toma una tarea." : "Toca Iniciar en una tarea."}
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
    <motion.div
      layout
      variants={dockChip}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="ai-shimmer group flex min-w-[180px] shrink-0 items-center gap-2 rounded-control border border-accent/30 bg-surface/70 px-2.5 py-2"
    >
      <Sparkles size={15} className="curva-live-dot shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-fg">{task?.name || "Tarea"}</p>
        <p className="tabular text-xs font-semibold text-accent">{formatClock(elapsed)}</p>
      </div>
      {/* Retomar a mano */}
      <button
        onClick={() => switchTo(taskId)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink text-white transition hover:bg-accent focus-ring"
        aria-label="Retomar a mano"
        title="Retomar a mano (quita la IA)"
      >
        <ArrowDownLeft size={13} />
      </button>
      {/* Detener IA */}
      <button
        onClick={() => stopAI(taskId)}
        className="shrink-0 rounded-md p-1 text-accent/60 opacity-100 transition hover:text-accent focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="Detener IA"
        title="Detener IA"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

/* ── Chip de tarea abierta pero en pausa ── */
function PausedChip({ taskId }: { taskId: string }) {
  const { switchTo, toggleAI, closeTask, aiEnabled } = useApp();
  const { taskById } = useData();
  const task = taskById[taskId];

  return (
    <motion.div
      layout
      variants={dockChip}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="group flex min-w-[128px] max-w-[220px] shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface py-1 pl-1 pr-1.5"
    >
      <button
        onClick={() => switchTo(taskId)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink text-white transition hover:bg-accent focus-ring"
        aria-label="Trabajar a mano"
        title="Trabajar a mano"
      >
        <Play size={11} fill="currentColor" />
      </button>
      <button onClick={() => switchTo(taskId)} className="min-w-0 flex-1 truncate text-left text-xs font-medium text-fg">
        {task?.name || "Tarea"}
      </button>
      {aiEnabled && (
        <button
          onClick={() => toggleAI(taskId)}
          className="shrink-0 rounded-md p-1 text-muted/70 transition hover:text-accent"
          aria-label="Pasar a la IA"
          title="Pasar a la IA"
        >
          <Sparkles size={13} />
        </button>
      )}
      <button
        onClick={() => closeTask(taskId)}
        className="shrink-0 rounded-md p-1 text-muted/60 opacity-100 transition hover:text-fg focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="Cerrar"
      >
        <X size={13} />
      </button>
    </motion.div>
  );
}
