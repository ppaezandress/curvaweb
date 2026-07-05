"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Plus, PencilLine, Flame, ArrowRight, Play, Pause, ChevronRight } from "lucide-react";
import { useApp, useLiveElapsed } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatClock, formatDuration } from "@/lib/format";
import { dueDateMs } from "@/lib/date";
import { isDone, isActionable, isAssignedTo } from "@/lib/task-status";
import { statusToneClass } from "@/lib/mock-data";
import { computePulse } from "@/lib/pulse";
import { useTimeRecords } from "@/lib/use-time-records";
import { Tile } from "@/components/ui/Tile";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskModal } from "@/components/NewTaskModal";
import { ManualEntryModal } from "@/components/ManualEntryModal";
import { EmptyState } from "@/components/ui/EmptyState";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default function HomePage() {
  const { currentUserId, active, stop, switchTo, loggedSecondsToday, sessionSecondsForTask } = useApp();
  const elapsed = useLiveElapsed();
  const { tasks, taskById, clientById, memberById } = useData();
  const { records } = useTimeRecords();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [showManual, setShowManual] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" enfoca la barra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && el?.tagName !== "INPUT" && el?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mine = useMemo(() => tasks.filter((t) => isAssignedTo(t, currentUserId)), [tasks, currentUserId]);

  // Pulso semanal (métrica insignia) a partir de MIS registros + MIS tareas.
  const myRecords = useMemo(
    () => records.filter((r) => (r.person || "").trim() === (me?.name || "").trim()),
    [records, me],
  );
  const pulse = useMemo(() => computePulse(myRecords, mine), [myRecords, mine]);

  // Carga de tareas: abiertas y vencidas (para el tile de Tareas).
  const load = useMemo(() => {
    const today0 = new Date().setHours(0, 0, 0, 0);
    const open = mine.filter((t) => !isDone(t.status));
    const overdue = open.filter((t) => {
      const due = dueDateMs(t.dueDate);
      return due != null && due < today0;
    }).length;
    return { open: open.length, overdue };
  }, [mine]);

  // "Para hoy": foco del día, ordenado por urgencia.
  const focusList = useMemo(() => {
    const today0 = new Date().setHours(0, 0, 0, 0);
    const urg = (t: (typeof mine)[number]) => {
      let s = 0;
      if (active?.taskId === t.id) s += 200;
      if (t.dueDate) {
        const due = dueDateMs(t.dueDate);
        if (due != null) {
          if (due < today0) s += 100;
          else if (due < today0 + 86_400_000) s += 50;
        }
      }
      if (t.priority === "Alta") s += 40;
      else if (t.priority === "Media") s += 15;
      if (/curso|progress|haciendo/i.test(t.status)) s += 10;
      return s;
    };
    return mine
      .filter((t) => !isDone(t.status) && (active?.taskId === t.id || isActionable(t.status)))
      .sort((a, b) => urg(b) - urg(a))
      .slice(0, 5);
  }, [mine, active]);

  // Command bar: SOLO tareas accionables, las mías primero.
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const ql = q.toLowerCase();
    return tasks
      .filter((t) => !isDone(t.status) && t.name.toLowerCase().includes(ql))
      .sort((a, b) => Number(isAssignedTo(b, currentUserId)) - Number(isAssignedTo(a, currentUserId)))
      .slice(0, 6);
  }, [q, tasks, currentUserId]);

  const openGuidedCreate = () => {
    const v = q.trim();
    if (!v) return;
    setNewName(v);
    setShowNew(true);
    setQ("");
  };

  const activeTask = active ? taskById[active.taskId] : undefined;
  const activeClient = activeTask ? clientById[activeTask.clientId] : undefined;

  return (
    <div className="space-y-6">
      {/* Saludo */}
      <header className="rise">
        <p className="text-body text-muted">{greeting()}</p>
        <h1 className="mt-0.5 flex items-center gap-3 font-brand text-3xl font-semibold tracking-tight text-fg">
          {me?.name?.split(" ")[0] || "Hola"}
          {pulse.streak > 1 && (
            <span className="inline-flex items-center gap-1 rounded-chip bg-accent/10 px-2.5 py-1 text-caption font-semibold text-accent">
              <Flame size={13} /> {pulse.streak} días
            </span>
          )}
        </h1>
      </header>

      {/* Command bar */}
      <div className="rise rise-1 relative z-40">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches.length === 0 && q.trim()) openGuidedCreate();
          }}
          placeholder="¿En qué trabajas? Busca o escribe una tarea nueva…  ( / )"
          className="w-full rounded-card border border-line bg-surface py-4 pl-12 pr-4 text-body shadow-soft outline-none transition focus:border-accent focus-ring"
        />
        {q.trim() && (
          <div className="absolute z-50 mt-2 max-h-[60vh] w-full overflow-y-auto rounded-card border border-line bg-surface shadow-float">
            {matches.map((t) => {
              const c = clientById[t.clientId];
              return (
                <button key={t.id} onClick={() => { switchTo(t.id); setQ(""); }} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2">
                  <Play size={14} className="shrink-0 text-accent" fill="currentColor" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-fg">{t.name}</span>
                    {c && <span className="block truncate text-caption text-muted">{c.name}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {t.priority && <PriorityDot priority={t.priority} />}
                    <span className={`rounded-chip px-2 py-0.5 text-caption font-semibold ${statusToneClass(t.status)}`}>{t.status}</span>
                  </span>
                </button>
              );
            })}
            <button onClick={openGuidedCreate} className="flex w-full items-center gap-3 border-t border-line bg-accent/5 px-4 py-3 text-left text-accent transition hover:bg-accent/10">
              <Plus size={15} />
              <span className="text-body font-semibold">Crear «{q.trim()}» y empezar a medir</span>
            </button>
          </div>
        )}
      </div>

      {/* Cronómetro activo */}
      {active && activeTask && (
        <section className="rise rise-2 curva-gradient overflow-hidden rounded-3xl p-6 text-white shadow-float">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-body text-white/80">
                <span className="curva-live-dot inline-block h-2.5 w-2.5 rounded-full bg-surface" /> Total en esta tarea
              </p>
              <p className="tabular mt-2 font-display text-4xl font-bold sm:text-5xl">
                {formatClock((activeTask.baselineSeconds ?? 0) + sessionSecondsForTask(activeTask.id) + elapsed)}
              </p>
              <p className="mt-1 text-body text-white/80">Esta sesión: <span className="tabular">{formatClock(elapsed)}</span></p>
              <p className="mt-1 truncate text-body text-white/80">{activeTask.name}{activeClient ? ` · ${activeClient.name}` : ""}</p>
            </div>
            <button onClick={stop} className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-control bg-surface px-5 py-2.5 text-sm font-bold text-fg transition hover:bg-surface/90 active:scale-[0.98]">
              <Pause size={15} fill="currentColor" /> Detener
            </button>
          </div>
        </section>
      )}

      {/* Overview: Pulso (hero) + tiles-puerta */}
      <section className="rise rise-2 grid gap-3 lg:grid-cols-3">
        {/* Pulso — la métrica insignia */}
        <Link
          href="/insights"
          className="focus-ring group flex flex-col justify-between gap-4 rounded-card border border-line bg-surface p-5 shadow-soft transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-float lg:row-span-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-caption uppercase text-muted">Pulso · esta semana</span>
            <ChevronRight size={16} className="text-muted/50 transition group-hover:translate-x-0.5 group-hover:text-accent" />
          </div>
          <div className="flex items-center justify-center py-2">
            <ScoreRing value={pulse.score} size={168} label="Pulso" />
          </div>
          <p className="text-body text-muted">{pulse.headline}</p>
        </Link>

        <Tile href="/insights" label="Registrado hoy" value={formatDuration(loggedSecondsToday)} />
        <Tile
          href="/tareas"
          label="Tareas abiertas"
          value={load.open}
          tone={load.overdue > 0 ? "warn" : "neutral"}
          footer={
            load.overdue > 0 ? (
              <span className="text-caption text-warn">{load.overdue} vencida{load.overdue === 1 ? "" : "s"}</span>
            ) : (
              <span className="text-caption text-muted">Al día</span>
            )
          }
        />
        <Tile href="/momentos" label="Racha" value={pulse.streak} unit="días" tone="accent" />
        <Tile href="/momentos" label="Días activos" value={pulse.activeDays} unit="/ 5" />
      </section>

      {/* Acciones primarias */}
      <section className="rise rise-3 grid grid-cols-2 gap-3">
        <button onClick={() => { setNewName(""); setShowNew(true); }} className="focus-ring flex items-center gap-3 rounded-card border border-accent bg-accent p-4 text-left text-white shadow-soft transition hover:opacity-95 active:scale-[0.99]">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-white/20"><Plus size={20} /></span>
          <span className="min-w-0"><span className="block font-semibold">Nueva tarea</span><span className="block truncate text-caption text-white/80">Créala y empieza a medir</span></span>
        </button>
        <button onClick={() => setShowManual(true)} className="focus-ring flex items-center gap-3 rounded-card border border-line bg-surface p-4 text-left text-fg shadow-soft transition hover:border-accent active:scale-[0.99]">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-surface-2"><PencilLine size={20} /></span>
          <span className="min-w-0"><span className="block font-semibold">Registrar tiempo</span><span className="block truncate text-caption text-muted">¿Ya trabajaste? Anótalo</span></span>
        </button>
      </section>

      {/* Para hoy */}
      <section className="rise rise-4">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-heading text-fg">Para hoy</h2>
            <p className="text-caption text-muted">{focusList.length > 0 ? "Ordenado por urgencia" : "Tu foco del día"}</p>
          </div>
          <Link href="/tareas" className="focus-ring inline-flex items-center gap-1 rounded-control px-1 text-sm font-medium text-accent">Ver todas <ArrowRight size={14} /></Link>
        </div>
        {focusList.length === 0 ? (
          <EmptyState
            icon={<Search size={28} />}
            title="Nada urgente por ahora"
            hint="Escribe en la barra de arriba para crear una tarea y empezar a medir tu tiempo."
          />
        ) : (
          <div className="space-y-2">{focusList.map((t) => <TaskCard key={t.id} task={t} />)}</div>
        )}
      </section>

      <NewTaskModal open={showNew} onClose={() => setShowNew(false)} initialName={newName} />
      <ManualEntryModal open={showManual} onClose={() => setShowManual(false)} />
    </div>
  );
}

// Punto de color por prioridad para los resultados del buscador.
function PriorityDot({ priority }: { priority: "Baja" | "Media" | "Alta" }) {
  const tone = priority === "Alta" ? "bg-danger" : priority === "Media" ? "bg-warn" : "bg-muted";
  return <span className={`h-2 w-2 rounded-full ${tone}`} title={`Prioridad ${priority}`} />;
}
