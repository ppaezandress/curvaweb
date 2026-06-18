"use client";

import { useApp } from "@/lib/app-context";
import { formatClock } from "@/lib/format";

export function TimerButton({ taskId }: { taskId: string }) {
  const { active, elapsed, start, stop } = useApp();
  const isRunning = active?.taskId === taskId;

  if (isRunning) {
    return (
      <button
        onClick={stop}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-soft"
      >
        <span className="curva-live-dot inline-block h-2.5 w-2.5 rounded-full bg-curva-pink" />
        <span className="tabular tracking-tight">{formatClock(elapsed)}</span>
        <span className="ml-1 text-white/60">·</span>
        <span>Detener</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => start(taskId)}
      className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-curva-purple hover:text-curva-purple"
    >
      <PlayIcon />
      Iniciar
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72c0 .79.87 1.27 1.54.84l10.8-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}
