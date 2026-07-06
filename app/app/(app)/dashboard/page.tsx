"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Plus, PencilLine, Flame, ArrowRight, Play, Pause, ChevronRight, Clock } from "lucide-react";
import { useApp, useLiveElapsed } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatClock, formatDuration } from "@/lib/format";
import { dueDateMs, mondayOf, DIAS_CORTOS } from "@/lib/date";
import { isDone, isActionable, isAssignedTo } from "@/lib/task-status";
import { statusToneClass } from "@/lib/mock-data";
import { computePulse } from "@/lib/pulse";
import { useTimeRecords } from "@/lib/use-time-records";
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
  const { currentUserId, active, stop, switchTo, sessionSecondsForTask } = useApp();
  const elapsed = useLiveElapsed();
  const { tasks, taskById, clientById, memberById } = useData();
  const { records } = useTimeRecords();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [showManual, setShowManual] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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
  const myRecords = useMemo(
    () => records.filter((r) => (r.person || "").trim() === (me?.name || "").trim()),
    [records, me],
  );
  const pulse = useMemo(() => computePulse(myRecords, mine), [myRecords, mine]);

  const load = useMemo(() => {
    const today0 = new Date().setHours(0, 0, 0, 0);
    const open = mine.filter((t) => !isDone(t.status));
    const overdue = open.filter((t) => {
      const due = dueDateMs(t.dueDate);
      return due != null && due < today0;
    }).length;
    const enCurso = open.filter((t) => /curso|progress|haciendo/i.test(t.status)).length;
    return { open: open.length, overdue, enCurso };
  }, [mine]);

  const week = useMemo(() => {
    const monday = mondayOf(new Date()).getTime();
    const bars = new Array(7).fill(0) as number[];
    for (const r of myRecords) {
      const ms = new Date(r.start).getTime();
      const di = Math.floor((ms - monday) / 86_400_000);
      if (di >= 0 && di < 7) bars[di] += r.minutes || 0;
    }
    const todayIdx = (new Date().getDay() + 6) % 7;
    return { bars, total: bars.reduce((a, b) => a + b, 0), todayIdx };
  }, [myRecords]);

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
      .slice(0, 6);
  }, [mine, active]);

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
  const max = Math.max(...week.bars, 1);

  return (
    <div className="space-y-5">
      {/* Saludo compacto */}
      <div className="rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl font-medium tracking-tight text-fg sm:text-[1.6rem]">
            {greeting()}{me?.name ? `, ${me.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-body text-muted">{pulse.headline}</p>
        </div>
        {pulse.streak > 1 && (
          <span className="inline-flex items-center gap-1.5 rounded-chip bg-accent/10 px-3 py-1.5 text-caption font-semibold text-accent">
            <Flame size={14} /> Racha de {pulse.streak} días
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ══ Columna de TRABAJO ══ */}
        <div className="space-y-4 lg:col-span-2">
          {/* Barra de comando */}
          <div className="rise rise-1 relative z-40">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches.length === 0 && q.trim()) openGuidedCreate();
              }}
              placeholder="Busca una tarea o escribe una nueva para empezar a medir…  ( / )"
              className="focus-ring w-full rounded-card border border-line bg-surface py-3.5 pl-12 pr-4 text-body shadow-soft outline-none transition focus:border-accent"
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
                      <span className={`rounded-chip px-2 py-0.5 text-caption font-semibold ${statusToneClass(t.status)}`}>{t.status}</span>
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

          {/* Cronómetro activo — claro: qué corre y qué pasa al pausar */}
          {active && activeTask && (
            <section className="rise rise-2 overflow-hidden rounded-card border border-accent/40 bg-accent/[0.05] p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-caption font-medium text-accent">
                    <span className="curva-live-dot inline-block h-2 w-2 rounded-full bg-accent" /> Corriendo ahora
                  </p>
                  <p className="mt-1 truncate font-display text-lg font-bold text-fg">{activeTask.name}</p>
                  <p className="truncate text-caption text-muted">{activeClient?.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular font-display text-3xl font-bold leading-none text-fg sm:text-4xl">
                    {formatClock((activeTask.baselineSeconds ?? 0) + sessionSecondsForTask(activeTask.id) + elapsed)}
                  </p>
                  <p className="mt-1 text-caption text-muted">total · sesión {formatClock(elapsed)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button onClick={stop} className="focus-ring inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]">
                  <Pause size={15} fill="currentColor" /> Pausar y guardar
                </button>
                <p className="text-caption text-muted">Al pausar, tu tiempo se guarda y se suma a la tarea. Reanudas cuando quieras.</p>
              </div>
            </section>
          )}

          {/* Tus tareas — arrancar/pausar y ver el tiempo de cada una */}
          <section className="rise rise-2">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="text-heading text-fg">Para hoy</h2>
                <p className="text-caption text-muted">Dale ▶ Iniciar para medir. El tiempo se acumula por tarea.</p>
              </div>
              <Link href="/tareas" className="focus-ring inline-flex items-center gap-1 rounded-control px-1 text-sm font-medium text-accent">Ver todas <ArrowRight size={14} /></Link>
            </div>
            {focusList.length === 0 ? (
              <EmptyState
                icon={<Search size={28} />}
                title="Nada pendiente por ahora"
                hint="Escribe arriba para crear una tarea y empezar a medir tu tiempo."
              />
            ) : (
              <div className="space-y-2">{focusList.map((t) => <TaskCard key={t.id} task={t} />)}</div>
            )}
          </section>
        </div>

        {/* ══ Columna de VISTAZO ══ */}
        <div className="space-y-4">
          {/* Pulso compacto */}
          <Link
            href="/insights"
            className="focus-ring group block rounded-card border border-line bg-surface p-5 shadow-soft transition hover:border-accent/40 hover:shadow-float"
          >
            <div className="flex items-center justify-between">
              <span className="text-caption font-medium text-muted">Pulso · esta semana</span>
              <ChevronRight size={16} className="text-muted/50 transition group-hover:translate-x-0.5 group-hover:text-accent" />
            </div>
            <div className="flex justify-center py-3">
              <ScoreRing value={pulse.score} size={128} label="Pulso" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-caption text-muted">
                <span>Tu semana</span>
                <span className="tabular">{formatDuration(week.total * 60)}</span>
              </div>
              <div className="flex items-end gap-1.5" role="img" aria-label={`Actividad de la semana, total ${formatDuration(week.total * 60)}`}>
                {week.bars.map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-10 w-full items-end">
                      <div className={`w-full rounded-[3px] ${i === week.todayIdx ? "bg-accent" : v > 0 ? "bg-accent/30" : "bg-surface-2"}`} style={{ height: `${Math.max((v / max) * 100, 6)}%` }} />
                    </div>
                    <span className={`text-caption ${i === week.todayIdx ? "font-bold text-accent" : "text-muted"}`}>{DIAS_CORTOS[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </Link>

          {/* Stats rápidos */}
          <div className="grid grid-cols-2 gap-3">
            <Link href="/tareas" className="focus-ring rounded-card border border-line bg-surface p-4 shadow-soft transition hover:border-accent/40">
              <p className="text-caption font-medium text-muted">Abiertas</p>
              <p className="tabular mt-1 font-display text-2xl font-bold text-fg">{load.open}</p>
              <p className="mt-0.5 text-caption text-muted">{load.overdue > 0 ? <span className="text-warn">{load.overdue} vencida{load.overdue === 1 ? "" : "s"}</span> : "al día"}</p>
            </Link>
            <Link href="/momentos" className="focus-ring rounded-card border border-line bg-surface p-4 shadow-soft transition hover:border-accent/40">
              <p className="text-caption font-medium text-muted">Días activos</p>
              <p className="tabular mt-1 font-display text-2xl font-bold text-fg">{pulse.activeDays}<span className="text-lg text-muted">/5</span></p>
              <p className="mt-0.5 text-caption text-muted">esta semana</p>
            </Link>
          </div>

          {/* Registrar tiempo (acción secundaria) */}
          <button onClick={() => setShowManual(true)} className="focus-ring flex w-full items-center gap-3 rounded-card border border-line bg-surface p-4 text-left text-fg shadow-soft transition hover:border-accent active:scale-[0.99]">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-surface-2"><PencilLine size={18} /></span>
            <span className="min-w-0"><span className="block text-sm font-semibold">Registrar tiempo</span><span className="block truncate text-caption text-muted">¿Ya trabajaste? Anótalo a mano</span></span>
          </button>
        </div>
      </div>

      <NewTaskModal open={showNew} onClose={() => setShowNew(false)} initialName={newName} />
      <ManualEntryModal open={showManual} onClose={() => setShowManual(false)} />
    </div>
  );
}
