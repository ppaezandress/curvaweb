"use client";

import { useApp } from "@/lib/app-context";
import { taskById } from "@/lib/mock-data";
import { formatDuration } from "@/lib/format";

export function IdleNudge() {
  const { nudge, keepIdle, discardIdle } = useApp();
  if (!nudge) return null;

  const task = taskById[nudge.taskId];
  const idleSeconds = Math.round((Date.now() - nudge.idleSince) / 1000);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-curva-purple/10">
          <span className="curva-live-dot inline-block h-3 w-3 rounded-full bg-curva-purple" />
        </div>
        <h2 className="font-display text-xl font-bold text-ink">
          ¿Sigues trabajando en esto?
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Llevas <span className="font-semibold text-ink">{formatDuration(idleSeconds)}</span>{" "}
          sin actividad en
          {task ? <span className="font-semibold text-ink"> «{task.name}»</span> : " esta tarea"}.
          Tú decides si ese rato cuenta.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={keepIdle}
            className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-soft"
          >
            Sí, seguía trabajando — conservar el tiempo
          </button>
          <button
            onClick={discardIdle}
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-zinc-600 transition hover:border-curva-pink hover:text-curva-pink"
          >
            Me fui — descartar {formatDuration(idleSeconds)}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400">
          Sin vigilancia: nadie revisa tu pantalla. Solo te ayudamos a que el
          dato sea real.
        </p>
      </div>
    </div>
  );
}
