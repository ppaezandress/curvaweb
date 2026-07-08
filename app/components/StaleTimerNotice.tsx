"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatDuration } from "@/lib/format";
import { SPRING_SNAPPY } from "@/lib/motion";

// Aviso cuando al reabrir la app había un cronómetro corriendo desde hace horas
// (olvidado / la compu apagada). No se cuenta solo; se invita a registrar lo real.
export function StaleTimerNotice() {
  const { staleTimer, dismissStaleTimer } = useApp();
  const { taskById } = useData();

  const task = staleTimer ? taskById[staleTimer.taskId] : undefined;
  const elapsed = staleTimer ? Math.max(0, Math.round((Date.now() - staleTimer.startedAt) / 1000)) : 0;
  const since = staleTimer ? new Date(staleTimer.startedAt).toLocaleString("es-MX", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";

  // AnimatePresence para animar la salida al descartar (antes: `if (!staleTimer) return null`
  // desaparecía de golpe). El propio contenedor fixed es el elemento animado (sube desde abajo).
  return (
    <AnimatePresence>
      {staleTimer && (
        <motion.div
          key="stale"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={SPRING_SNAPPY}
          className="fixed inset-x-0 bottom-20 z-[55] flex justify-center px-4 sm:bottom-6"
          data-no-capture="1"
        >
          <div className="flex w-full max-w-md items-start gap-3 rounded-card border border-warn/30 bg-surface p-4 shadow-float">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warn/10 text-warn">
          <AlertTriangle size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">Cronómetro olvidado</p>
          <p className="mt-0.5 text-xs text-muted">
            {task?.name ? <>Dejaste corriendo <span className="font-medium text-fg">{task.name}</span> </> : "Dejaste un cronómetro corriendo "}
            desde {since} ({formatDuration(elapsed)}). No lo contamos automáticamente — si trabajaste, regístralo a mano con <span className="font-medium text-fg">Registrar tiempo</span>.
          </p>
          <button onClick={dismissStaleTimer} className="mt-2 rounded-full bg-warn/10 px-3 py-1 text-xs font-semibold text-warn transition hover:bg-warn/20 focus-ring">
            Entendido
          </button>
        </div>
            <button onClick={dismissStaleTimer} className="shrink-0 rounded-full p-1 text-muted transition hover:bg-surface-2" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
