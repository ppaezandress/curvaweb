"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Pause, Play, ArrowRight, ListTodo, CircleDot, FolderKanban } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { type Task } from "@/lib/mock-data";
import { formatClock, formatDuration } from "@/lib/format";
import { TaskCard } from "@/components/TaskCard";
import { RecentSessions } from "@/components/RecentSessions";

const isActionable = (s: string) =>
  /curso|progress|haciendo|demor|atras|blocked|validar|revis|espera|hold/i.test(s || "");

function today() {
  try {
    const d = new Date().toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return d.charAt(0).toUpperCase() + d.slice(1);
  } catch {
    return "";
  }
}

export default function HomePage() {
  const { currentUserId, active, elapsed, stop, loggedSecondsToday, focusApp } = useApp();
  const { tasks, memberById, taskById, projectById, clientById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const mine = useMemo(
    () =>
      tasks.filter(
        (t) => t.responsableId === currentUserId || t.auxiliarId === currentUserId,
      ),
    [tasks, currentUserId],
  );
  const enCurso = mine.filter((t) => isActionable(t.status));
  const projectCount = new Set(mine.map((t) => t.projectId)).size;

  // "Continuar": lo accionable primero, luego sin empezar — máximo 5.
  const continuar = useMemo(() => {
    const ranked = [...mine].sort((a, b) => {
      const score = (t: Task) => (isActionable(t.status) ? 0 : 1);
      return score(a) - score(b);
    });
    return ranked.slice(0, 5);
  }, [mine]);

  const activeTask = active ? taskById[active.taskId] : undefined;
  const activeClient = activeTask ? clientById[activeTask.clientId] : undefined;
  const activeProject = activeTask ? projectById[activeTask.projectId] : undefined;

  return (
    <div className="space-y-8">
      {/* Saludo */}
      <header className="rise">
        <p className="text-sm capitalize text-zinc-400">{today()}</p>
        <h1 className="mt-0.5 font-display text-3xl font-bold tracking-tight text-ink">
          Hola, {me?.name?.split(" ")[0] || "👋"}
        </h1>
      </header>

      {/* Tarjeta protagonista */}
      {active && activeTask ? (
        <section className="curva-gradient rise rise-1 overflow-hidden rounded-[28px] p-7 text-white shadow-float sm:p-9">
          <div className="flex items-center gap-2 text-sm font-medium text-white/80">
            <span className="curva-live-dot inline-block h-2.5 w-2.5 rounded-full bg-white" />
            Cronómetro corriendo
          </div>
          <p className="tabular mt-5 font-display text-6xl font-bold leading-none tracking-tight sm:text-7xl">
            {formatClock(elapsed)}
          </p>
          <p className="mt-4 max-w-md truncate text-lg font-semibold">{activeTask.name}</p>
          <p className="text-sm text-white/70">
            {activeClient?.name}
            {activeProject ? ` · ${activeProject.name}` : ""}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={stop}
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-ink transition hover:bg-white/90"
            >
              <Pause size={16} fill="currentColor" /> Detener y guardar
            </button>
            {focusApp && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur">
                En foco: {focusApp.label}
                {focusApp.tone === "distraction" && " · ¿distracción?"}
              </span>
            )}
          </div>
        </section>
      ) : (
        <section className="rise rise-1 overflow-hidden rounded-[28px] bg-ink p-7 text-white shadow-float sm:p-9">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-white/50">
                Medido hoy
              </p>
              <p className="tabular mt-2 font-display text-6xl font-bold leading-none tracking-tight sm:text-7xl">
                {formatDuration(loggedSecondsToday)}
              </p>
              <p className="mt-3 text-sm text-white/60">
                {loggedSecondsToday > 0
                  ? "Vas bien. Sigue midiendo tu tiempo."
                  : "Elige una tarea y empieza a medir tu día."}
              </p>
            </div>
            <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 sm:flex">
              <span className="curva-gradient-text font-display text-3xl font-extrabold">c</span>
            </span>
          </div>
          <Link
            href="/tareas"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-ink transition hover:bg-white/90"
          >
            <Play size={15} fill="currentColor" /> Empezar a medir
          </Link>
        </section>
      )}

      {/* Stats */}
      <section className="rise rise-2 grid grid-cols-3 gap-3 sm:gap-4">
        <Stat icon={<ListTodo size={16} />} label="Asignadas" value={mine.length} />
        <Stat icon={<CircleDot size={16} />} label="En curso" value={enCurso.length} accent />
        <Stat icon={<FolderKanban size={16} />} label="Proyectos" value={projectCount} />
      </section>

      {/* Continuar + Actividad */}
      <section className="rise rise-3 grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Continuar</h2>
            <Link
              href="/tareas"
              className="inline-flex items-center gap-1 text-sm font-medium text-curva-purple transition hover:gap-1.5"
            >
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>
          {continuar.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-zinc-400">
              No tienes tareas asignadas todavía.
            </div>
          ) : (
            <div className="space-y-2">
              {continuar.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0 lg:col-span-1">
          <RecentSessions />
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${
          accent ? "bg-curva-purple/10 text-curva-purple" : "bg-zinc-100 text-zinc-500"
        }`}
      >
        {icon}
      </span>
      <p className="tabular mt-3 font-display text-3xl font-bold text-ink">{value}</p>
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
    </div>
  );
}
