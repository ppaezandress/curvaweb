"use client";

import { Clock, Trash2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatDuration, hhmmFromMs as hhmm } from "@/lib/format";

export function RecentSessions() {
  const { entries, removeEntry } = useApp();
  const { taskById, clientById } = useData();
  const recent = [...entries].reverse().slice(0, 6);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-fg">
        <Clock size={18} /> Lo que registraste hoy
      </h2>
      <p className="mb-4 text-sm text-muted">
        Cada vez que detienes el cronómetro, queda aquí.
      </p>

      {recent.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-muted">
          Aún no registras tiempo. Dale <span className="font-semibold text-muted">Iniciar</span> a una tarea.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((e) => {
            const task = taskById[e.taskId];
            const client = task ? clientById[task.clientId] : undefined;
            return (
              <li key={e.id} className="group flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {task?.name ?? "Tarea"}
                  </p>
                  <p className="text-xs text-muted">
                    {client?.name} · {hhmm(e.startedAt)}–{hhmm(e.endedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular text-sm font-semibold text-fg">
                    {formatDuration(e.seconds)}
                  </span>
                  <button
                    onClick={() => { if (confirm("¿Quitar este registro de tiempo?")) removeEntry(e.id); }}
                    className="rounded-full p-1.5 text-muted opacity-0 transition hover:bg-rose-50 hover:text-rose-500 focus-ring group-hover:opacity-100"
                    aria-label="Quitar registro"
                    title="Quitar este registro"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
