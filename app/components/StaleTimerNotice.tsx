"use client";

import { AlertTriangle, X } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatDuration } from "@/lib/format";

// Aviso cuando al reabrir la app había un cronómetro corriendo desde hace horas
// (olvidado / la compu apagada). No se cuenta solo; se invita a registrar lo real.
export function StaleTimerNotice() {
  const { staleTimer, dismissStaleTimer } = useApp();
  const { taskById } = useData();
  if (!staleTimer) return null;

  const task = taskById[staleTimer.taskId];
  const elapsed = Math.max(0, Math.round((Date.now() - staleTimer.startedAt) / 1000));
  const since = new Date(staleTimer.startedAt).toLocaleString("es-MX", { weekday: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed inset-x-0 bottom-20 z-[55] flex justify-center px-4 sm:bottom-6" data-no-capture="1">
      <div className="flex w-full max-w-md items-start gap-3 rounded-2xl border border-amber-500/30 bg-surface p-4 shadow-float">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
          <AlertTriangle size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">Cronómetro olvidado</p>
          <p className="mt-0.5 text-xs text-muted">
            {task?.name ? <>Dejaste corriendo <span className="font-medium text-fg">{task.name}</span> </> : "Dejaste un cronómetro corriendo "}
            desde {since} ({formatDuration(elapsed)}). No lo contamos automáticamente — si trabajaste, regístralo a mano con <span className="font-medium text-fg">Registrar tiempo</span>.
          </p>
          <button onClick={dismissStaleTimer} className="mt-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 transition hover:bg-amber-500/20 focus-ring">
            Entendido
          </button>
        </div>
        <button onClick={dismissStaleTimer} className="shrink-0 rounded-full p-1 text-muted transition hover:bg-surface-2" aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
