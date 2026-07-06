"use client";

import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatDuration, hhmmFromMs as hhmm } from "@/lib/format";

// Al pausar, si hubo inactividad, el usuario revisa una LÍNEA DE TIEMPO de la
// sesión y decide: descontar solo los huecos inactivos, o mantenerlos (marcados).
export function IdleReview() {
  const { pendingReview, resolveReview } = useApp();
  const data = useData();
  if (!pendingReview) return null;

  const pr = pendingReview;
  const task = data.taskById[pr.taskId];
  const span = Math.max(1, pr.endedAt - pr.startedAt);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl bg-surface p-6 shadow-float sm:rounded-hero">
        <p className="text-sm font-medium text-accent">Revisión de tiempo</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-fg">
          Detectamos {formatDuration(pr.inactiveSec)} sin actividad
        </h2>
        <p className="mt-1 truncate text-sm text-muted">
          {task?.name || "Tarea"} · {hhmm(pr.startedAt)}–{hhmm(pr.endedAt)}
        </p>

        {/* Línea de tiempo: verde=activo, gris rayado=inactivo */}
        <div className="mt-5">
          <div className="relative h-10 w-full overflow-hidden rounded-control bg-success/25">
            {pr.segments.map((s, i) => {
              const left = ((s.start - pr.startedAt) / span) * 100;
              const width = ((s.end - s.start) / span) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-0 h-full bg-surface-2"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(0.5, width)}%`,
                    backgroundImage:
                      "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.08) 4px, rgba(0,0,0,0.08) 8px)",
                  }}
                  title={`Inactivo ${hhmm(s.start)}–${hhmm(s.end)}`}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-caption text-muted">
            <span>{hhmm(pr.startedAt)}</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-success" /> Activo {formatDuration(pr.activeSec)}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-surface-2" /> Inactivo {formatDuration(pr.inactiveSec)}</span>
            </span>
            <span>{hhmm(pr.endedAt)}</span>
          </div>
        </div>

        {/* Tramos inactivos detallados */}
        {pr.segments.length > 0 && (
          <ul className="mt-4 max-h-28 space-y-1 overflow-y-auto text-sm">
            {pr.segments.map((s, i) => (
              <li key={i} className="flex justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-muted">
                <span>Sin actividad</span>
                <span className="tabular">{hhmm(s.start)}–{hhmm(s.end)} · {formatDuration(round(s.end - s.start))}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => resolveReview(true)}
            className="w-full rounded-card bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-soft"
          >
            Descontar el tiempo inactivo ({formatDuration(pr.inactiveSec)})
          </button>
          <button
            onClick={() => resolveReview(false)}
            className="w-full rounded-card border border-line bg-surface px-4 py-3 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent"
          >
            Mantener todo (marcado como {formatDuration(pr.inactiveSec)} sin actividad)
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          Tu tiempo, tu decisión. Sin vigilancia — solo para que el dato sea real.
        </p>
      </div>
    </div>
  );
}

const round = (ms: number) => Math.max(0, Math.round(ms / 1000));
