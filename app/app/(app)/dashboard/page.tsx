"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Search, Plus, PencilLine, Flame, ArrowRight, Play, Pause,
} from "lucide-react";
import { useApp, useLiveElapsed } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatClock } from "@/lib/format";
import { dayKey, computeStreak } from "@/lib/culture";
import { isDone, isActionable, isAssignedTo } from "@/lib/task-status";
import { statusToneClass } from "@/lib/mock-data";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskModal } from "@/components/NewTaskModal";
import { AITodayCard } from "@/components/AITodayCard";
import { ManualEntryModal } from "@/components/ManualEntryModal";
import { MomentumDashboard } from "@/components/MomentumDashboard";
import { AchievementsStrip } from "@/components/AchievementsStrip";
import { EmptyState } from "@/components/ui/EmptyState";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default function HomePage() {
  const { currentUserId, active, stop, switchTo, loggedSecondsToday, sessionSecondsForTask } = useApp();
  const elapsed = useLiveElapsed();
  const { tasks, taskById, clientById, memberById } = useData();
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

  const mine = useMemo(
    () => tasks.filter((t) => isAssignedTo(t, currentUserId)),
    [tasks, currentUserId],
  );
  // "Para hoy": foco del día, ordenado por urgencia (vencidas/hoy/prioridad/en curso).
  const focusList = useMemo(() => {
    const today0 = new Date().setHours(0, 0, 0, 0);
    const urg = (t: typeof mine[number]) => {
      let s = 0;
      if (active?.taskId === t.id) s += 200;
      if (t.dueDate) { const due = new Date(t.dueDate).getTime(); if (due < today0) s += 100; else if (due < today0 + 86_400_000) s += 50; }
      if (t.priority === "Alta") s += 40; else if (t.priority === "Media") s += 15;
      if (/curso|progress|haciendo/i.test(t.status)) s += 10;
      return s;
    };
    return mine
      .filter((t) => !isDone(t.status) && (active?.taskId === t.id || isActionable(t.status)))
      .sort((a, b) => urg(b) - urg(a))
      .slice(0, 5);
  }, [mine, active]);

  // Búsqueda para la command bar: SOLO tareas accionables (pendiente/en curso/sin empezar),
  // nunca las Done. Las mías primero.
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const ql = q.toLowerCase();
    return tasks
      .filter((t) => !isDone(t.status) && t.name.toLowerCase().includes(ql))
      .sort((a, b) => Number(isAssignedTo(b, currentUserId)) - Number(isAssignedTo(a, currentUserId)))
      .slice(0, 6);
  }, [q, tasks, currentUserId]);

  // Racha de días con registro (derivada del cronómetro local + hoy).
  const localStreak = useMemo(() => {
    try {
      const raw = currentUserId ? localStorage.getItem(`curva.timer.${currentUserId}`) : null;
      const days = new Set<string>();
      if (raw) {
        const parsed = JSON.parse(raw);
        (parsed.entries || []).forEach((e: { endedAt: number }) => days.add(dayKey(e.endedAt)));
      }
      if (loggedSecondsToday > 0) days.add(dayKey(Date.now()));
      return computeStreak(days);
    } catch { return 0; }
  }, [currentUserId, loggedSecondsToday]);

  // Crear desde la barra = abrir el flujo GUIADO (nunca "pelona"): el modal pide
  // prioridad, esfuerzo, fecha y cliente, ya prellenados por Curvi a partir del texto.
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
    <div className="space-y-7">
      {/* Saludo + núcleo del producto */}
      <header className="rise">
        <p className="text-sm text-muted">{greeting()}</p>
        <h1 className="mt-0.5 font-brand text-3xl font-semibold tracking-tight text-fg">
          {me?.name?.split(" ")[0] || "👋"}
          {localStreak > 1 && (
            <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 align-middle text-sm font-semibold text-orange-600">
              <Flame size={14} /> {localStreak} días
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted">Mide el tiempo de tus tareas. Empieza escribiendo abajo. 👇</p>
      </header>

      {/* Command bar — z alto para que el dropdown quede SOBRE las demás secciones */}
      <div className="rise rise-1 relative z-40">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches.length === 0 && q.trim()) openGuidedCreate(); }}
          placeholder="¿En qué trabajas? Busca o escribe una tarea nueva…  ( / )"
          className="w-full rounded-2xl border border-line bg-surface py-4 pl-12 pr-4 text-base shadow-soft outline-none transition focus:border-accent"
        />
        {q.trim() && (
          <div className="absolute z-50 mt-2 max-h-[60vh] w-full overflow-y-auto rounded-2xl border border-line bg-surface shadow-float">
            {matches.map((t) => {
              const c = clientById[t.clientId];
              return (
                <button key={t.id} onClick={() => { switchTo(t.id); setQ(""); }} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2">
                  <Play size={14} className="shrink-0 text-accent" fill="currentColor" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{t.name}</span>
                    {c && <span className="block truncate text-xs text-muted">{c.name}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {t.priority && <PriorityDot priority={t.priority} />}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusToneClass(t.status)}`}>{t.status}</span>
                  </span>
                </button>
              );
            })}
            <button onClick={openGuidedCreate} className="flex w-full items-center gap-3 border-t border-line bg-accent/5 px-4 py-3 text-left text-accent transition hover:bg-accent/10">
              <Plus size={15} />
              <span className="text-sm font-semibold">Crear «{q.trim()}» y empezar a medir</span>
            </button>
          </div>
        )}
      </div>

      {/* Ahora (si hay cronómetro) */}
      {active && activeTask && (
        <section className="rise rise-2 curva-gradient overflow-hidden rounded-3xl p-6 text-white shadow-float">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm text-white/80"><span className="curva-live-dot inline-block h-2.5 w-2.5 rounded-full bg-surface" /> Total en esta tarea</p>
              <p className="tabular mt-2 font-display text-4xl font-bold sm:text-5xl">{formatClock((activeTask.baselineSeconds ?? 0) + sessionSecondsForTask(activeTask.id) + elapsed)}</p>
              <p className="mt-1 text-sm text-white/80">Esta sesión: <span className="tabular">{formatClock(elapsed)}</span></p>
              <p className="mt-1 truncate text-sm text-white/80">{activeTask.name}{activeClient ? ` · ${activeClient.name}` : ""}</p>
            </div>
            <button onClick={stop} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-surface px-5 py-2.5 text-sm font-bold text-fg transition hover:bg-surface/90">
              <Pause size={15} fill="currentColor" /> Detener
            </button>
          </div>
        </section>
      )}

      {/* Acciones primarias (sin duplicar el nav) */}
      <section className="rise rise-2 grid grid-cols-2 gap-3">
        <button onClick={() => { setNewName(""); setShowNew(true); }} className="flex items-center gap-3 rounded-2xl border border-accent bg-accent p-4 text-left text-white shadow-soft transition focus-ring hover:opacity-95 active:scale-[0.99]">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface/20"><Plus size={20} /></span>
          <span className="min-w-0"><span className="block font-semibold">Nueva tarea</span><span className="block truncate text-xs text-white/80">Créala y empieza a medir</span></span>
        </button>
        <button onClick={() => setShowManual(true)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left text-fg shadow-soft transition focus-ring hover:border-accent active:scale-[0.99]">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2"><PencilLine size={20} /></span>
          <span className="min-w-0"><span className="block font-semibold">Registrar tiempo</span><span className="block truncate text-xs text-muted">¿Ya trabajaste? Anótalo</span></span>
        </button>
      </section>

      {/* Tiempo de IA en vivo (conector Claude Code/Desktop) */}
      <div className="rise rise-3">
        <AITodayCard />
      </div>

      {/* Momentum (estilo WHOOP): tu día vs tu día típico + semana interactiva */}
      <section className="rise rise-3">
        <MomentumDashboard />
      </section>

      {/* Muro de logros (cultura) */}
      <section className="rise rise-4">
        <AchievementsStrip />
      </section>

      {/* Mi día */}
      <section className="rise rise-4">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-fg">Para hoy</h2>
            <p className="text-xs text-muted">{focusList.length > 0 ? "Ordenado por urgencia" : "Tu foco del día"}</p>
          </div>
          <Link href="/tareas" className="inline-flex items-center gap-1 text-sm font-medium text-accent focus-ring rounded-full">Ver todas <ArrowRight size={14} /></Link>
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

// Punto de color por prioridad (Alta/Media/Baja) para los resultados del buscador.
function PriorityDot({ priority }: { priority: "Baja" | "Media" | "Alta" }) {
  const tone = priority === "Alta" ? "bg-rose-500" : priority === "Media" ? "bg-amber-500" : "bg-zinc-400";
  return <span className={`h-2 w-2 rounded-full ${tone}`} title={`Prioridad ${priority}`} />;
}
