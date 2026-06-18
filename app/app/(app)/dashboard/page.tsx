"use client";

import { useState } from "react";
import { useApp } from "@/lib/app-context";
import {
  memberById,
  projectById,
  clientById,
  tasks,
  type Task,
} from "@/lib/mock-data";
import { formatDuration } from "@/lib/format";
import { TaskCard } from "@/components/TaskCard";
import { NowHero } from "@/components/NowHero";
import { RecentSessions } from "@/components/RecentSessions";

type Segment = "mine" | "all";

export default function DashboardPage() {
  const { currentUserId, sessionSecondsForTask } = useApp();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const [segment, setSegment] = useState<Segment>("mine");

  const mine = tasks.filter(
    (t) => t.responsableId === currentUserId || t.auxiliarId === currentUserId,
  );
  const visible = segment === "mine" ? mine : tasks;
  const runningCount = mine.filter((t) => t.status === "En curso").length;

  // Agrupar por proyecto para mayor claridad.
  const groups = Object.values(projectById)
    .map((p) => ({
      project: p,
      client: clientById[p.clientId],
      items: visible.filter((t) => t.projectId === p.id),
    }))
    .filter((g) => g.items.length > 0);

  const groupSeconds = (items: Task[]) =>
    items.reduce(
      (a, t) => a + t.baselineSeconds + sessionSecondsForTask(t.id),
      0,
    );

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-ink">
          Hola, {me?.name.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-zinc-500">
          Mide tu tiempo con un clic. Tú tienes el control.
        </p>
      </div>

      <NowHero assignedCount={mine.length} runningCount={runningCount} />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Lista de tareas */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Tareas</h2>
            <div className="inline-flex rounded-full border border-line bg-white p-0.5 text-sm">
              <button
                onClick={() => setSegment("mine")}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  segment === "mine" ? "bg-ink text-white" : "text-zinc-500"
                }`}
              >
                Mis tareas
              </button>
              <button
                onClick={() => setSegment("all")}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  segment === "all" ? "bg-ink text-white" : "text-zinc-500"
                }`}
              >
                Todas
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.project.id}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-zinc-600">
                    {g.project.name}
                    <span className="font-normal text-zinc-400"> · {g.client?.name}</span>
                  </h3>
                  <span className="tabular text-xs text-zinc-400">
                    {formatDuration(groupSeconds(g.items))}
                  </span>
                </div>
                <div className="space-y-2">
                  {g.items.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            ))}

            {groups.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line p-10 text-center text-zinc-400">
                No hay tareas para mostrar.
              </div>
            )}
          </div>
        </div>

        {/* Registros recientes */}
        <div className="lg:col-span-1">
          <RecentSessions />
        </div>
      </div>
    </div>
  );
}
