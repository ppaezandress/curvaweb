"use client";

import { Clock } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { taskById, clientById } from "@/lib/mock-data";
import { formatDuration } from "@/lib/format";

function hhmm(ms: number) {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export function RecentSessions() {
  const { entries } = useApp();
  const recent = [...entries].reverse().slice(0, 6);

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-ink">
        <Clock size={18} /> Lo que registraste hoy
      </h2>
      <p className="mb-4 text-sm text-zinc-500">
        Cada vez que detienes el cronómetro, queda aquí.
      </p>

      {recent.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-zinc-400">
          Aún no registras tiempo. Dale <span className="font-semibold text-zinc-500">Iniciar</span> a una tarea.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((e) => {
            const task = taskById[e.taskId];
            const client = task ? clientById[task.clientId] : undefined;
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {task?.name ?? "Tarea"}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {client?.name} · {hhmm(e.startedAt)}–{hhmm(e.endedAt)}
                  </p>
                </div>
                <span className="tabular shrink-0 text-sm font-semibold text-ink">
                  {formatDuration(e.seconds)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
