"use client";

import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatClock } from "@/lib/format";

export function ActiveTimerBar() {
  const { active, elapsed, stop } = useApp();
  const { taskById, clientById } = useData();
  if (!active) return null;

  const task = taskById[active.taskId];
  const client = task ? clientById[task.clientId] : undefined;

  return (
    <div className="curva-gradient text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="curva-live-dot inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-white" />
          <p className="truncate text-sm">
            <span className="font-semibold">Cronómetro activo</span>
            <span className="text-white/70"> · {task?.name}</span>
            {client && <span className="text-white/60"> ({client.name})</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="tabular font-display text-lg font-bold">
            {formatClock(elapsed)}
          </span>
          <button
            onClick={stop}
            className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold backdrop-blur transition hover:bg-white/25"
          >
            Detener
          </button>
        </div>
      </div>
    </div>
  );
}
