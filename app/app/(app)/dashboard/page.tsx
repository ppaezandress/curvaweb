"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Search, Plus, PencilLine, CalendarDays, BarChart3, Building2,
  Flame, Sparkles, ArrowRight, Play, Pause, Loader2,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { type Task } from "@/lib/mock-data";
import { formatClock, formatDuration } from "@/lib/format";
import { dayKey, computeStreak } from "@/lib/culture";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskModal } from "@/components/NewTaskModal";
import { ManualEntryModal } from "@/components/ManualEntryModal";
import { SpotifyConnect } from "@/components/SpotifyConnect";
import { WeekProgress } from "@/components/WeekProgress";
import { AchievementsStrip } from "@/components/AchievementsStrip";

const isActionable = (s: string) => /curso|progress|haciendo|demor|atras|blocked|validar|revis|espera|hold/i.test(s || "");
const isDone = (s: string) => /done|complet|listo|termin/i.test(s || "");

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default function HomePage() {
  const { currentUserId, active, elapsed, stop, switchTo, loggedSecondsToday } = useApp();
  const { tasks, taskById, clientById, memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [creating, setCreating] = useState(false);
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
    () => tasks.filter((t) => t.responsableId === currentUserId || t.auxiliarId === currentUserId),
    [tasks, currentUserId],
  );
  const focusList = useMemo(
    () => mine.filter((t) => !isDone(t.status) && (active?.taskId === t.id || isActionable(t.status))).slice(0, 5),
    [mine, active],
  );
  const projectCount = new Set(mine.map((t) => t.projectId)).size;

  // Búsqueda de tareas existentes (para la command bar)
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    return tasks.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
  }, [q, tasks]);

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

  const createFromBar = async () => {
    if (!q.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: q.trim(), responsableId: currentUserId }),
      });
      const d = await res.json();
      if (d.ok && d.id) { switchTo(d.id); setQ(""); }
    } finally { setCreating(false); }
  };

  const activeTask = active ? taskById[active.taskId] : undefined;
  const activeClient = activeTask ? clientById[activeTask.clientId] : undefined;

  return (
    <div className="space-y-7">
      {/* Saludo */}
      <header className="rise">
        <p className="text-sm text-zinc-400">{greeting()}</p>
        <h1 className="mt-0.5 font-display text-3xl font-bold tracking-tight text-ink">
          {me?.name?.split(" ")[0] || "👋"}
          {localStreak > 1 && (
            <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 align-middle text-sm font-semibold text-orange-600">
              <Flame size={14} /> {localStreak} días
            </span>
          )}
        </h1>
      </header>

      {/* Command bar — z alto para que el dropdown quede SOBRE las demás secciones */}
      <div className="rise rise-1 relative z-40">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches.length === 0 && q.trim()) createFromBar(); }}
          placeholder="¿En qué trabajas? Busca o escribe una tarea nueva…  ( / )"
          className="w-full rounded-2xl border border-line bg-white py-4 pl-12 pr-4 text-base shadow-soft outline-none transition focus:border-curva-purple"
        />
        {q.trim() && (
          <div className="absolute z-50 mt-2 max-h-[60vh] w-full overflow-y-auto rounded-2xl border border-line bg-white shadow-float">
            {matches.map((t) => {
              const c = clientById[t.clientId];
              return (
                <button key={t.id} onClick={() => { switchTo(t.id); setQ(""); }} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50">
                  <Play size={14} className="shrink-0 text-curva-purple" fill="currentColor" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{t.name}</span>
                    {c && <span className="block truncate text-xs text-zinc-400">{c.name}</span>}
                  </span>
                </button>
              );
            })}
            <button onClick={createFromBar} disabled={creating} className="flex w-full items-center gap-3 border-t border-line bg-curva-purple/5 px-4 py-3 text-left text-curva-purple transition hover:bg-curva-purple/10">
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
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
              <p className="flex items-center gap-2 text-sm text-white/80"><span className="curva-live-dot inline-block h-2.5 w-2.5 rounded-full bg-white" /> Corriendo</p>
              <p className="tabular mt-2 font-display text-4xl font-bold sm:text-5xl">{formatClock(elapsed)}</p>
              <p className="mt-1 truncate text-sm text-white/80">{activeTask.name}{activeClient ? ` · ${activeClient.name}` : ""}</p>
            </div>
            <button onClick={stop} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-white/90">
              <Pause size={15} fill="currentColor" /> Detener
            </button>
          </div>
        </section>
      )}

      {/* Acciones rápidas */}
      <section className="rise rise-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Action onClick={() => { setNewName(""); setShowNew(true); }} icon={<Plus size={20} />} label="Nueva tarea" accent />
          <Action onClick={() => setShowManual(true)} icon={<PencilLine size={20} />} label="Registrar tiempo" />
          <ActionLink href="/tareas" icon={<Building2 size={20} />} label="Por cliente" />
          <ActionLink href="/timesheet" icon={<CalendarDays size={20} />} label="Semana" />
          <ActionLink href="/reportes" icon={<BarChart3 size={20} />} label="Reportes" />
          <ActionLink href="/recap" icon={<Sparkles size={20} />} label="Recap" />
        </div>
      </section>

      {/* Spotify */}
      <section className="rise rise-3">
        <SpotifyConnect />
      </section>

      {/* Stats + progreso semanal */}
      <section className="rise rise-3 grid gap-3 sm:gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <Stat label="Hoy" value={formatDuration(loggedSecondsToday)} />
          <Stat label="En curso" value={String(mine.filter((t) => isActionable(t.status)).length)} accent />
          <Stat label="Proyectos" value={String(projectCount)} />
        </div>
        <WeekProgress />
      </section>

      {/* Muro de logros (cultura) */}
      <section className="rise rise-4">
        <AchievementsStrip />
      </section>

      {/* Mi día */}
      <section className="rise rise-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Para hoy</h2>
          <Link href="/tareas" className="inline-flex items-center gap-1 text-sm font-medium text-curva-purple">Ver todas <ArrowRight size={14} /></Link>
        </div>
        {focusList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-zinc-400">
            Nada urgente. Usa la barra de arriba para empezar algo. 🎯
          </div>
        ) : (
          <div className="space-y-2">{focusList.map((t) => <TaskCard key={t.id} task={t} />)}</div>
        )}
      </section>

      <NewTaskModal open={showNew} onClose={() => setShowNew(false)} initialName={newName} />
      <ManualEntryModal open={showManual} onClose={() => setShowManual(false)} />
    </div>
  );
}

function Action({ icon, label, onClick, accent }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center text-sm font-semibold shadow-soft transition hover:-translate-y-0.5 ${accent ? "border-curva-purple bg-curva-purple text-white" : "border-line bg-white text-ink hover:border-zinc-300"}`}>
      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${accent ? "bg-white/20" : "bg-zinc-100"}`}>{icon}</span>
      {label}
    </button>
  );
}
function ActionLink({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <Link href={href} className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-white p-4 text-center text-sm font-semibold text-ink shadow-soft transition hover:-translate-y-0.5 hover:border-zinc-300">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">{icon}</span>
      {label}
    </Link>
  );
}
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`tabular mt-1 font-display text-2xl font-bold ${accent ? "text-curva-purple" : "text-ink"}`}>{value}</p>
    </div>
  );
}
