"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sparkles, Zap, Brain, CalendarClock, AlertTriangle, Clock3, Play, Layers, ArrowRight,
} from "lucide-react";
import { useData } from "@/lib/data-context";
import { useApp } from "@/lib/app-context";
import { isAssignedTo, isActionable, isDone } from "@/lib/task-status";
import { formatDuration } from "@/lib/format";
import type { Task } from "@/lib/mock-data";

type Ctx = "normal" | "foco" | "ligero";
const estimMin = (w?: Task["weight"]) => (w === "Ligera" ? 30 : w === "Pesada" ? 180 : w === "Media" ? 90 : 60);
const isOverdue = (t: Task) => !!t.dueDate && !isDone(t.status) && new Date(t.dueDate).getTime() < Date.now();
const isFresh = (t: Task) => !!t.createdAt && Date.now() - new Date(t.createdAt).getTime() < 48 * 3600_000;
const isDelayed = (t: Task) => /demor|atras|blocked/i.test(t.status);

export function CoachPanel() {
  const { tasks } = useData();
  const { currentUserId, switchTo, toggleAI } = useApp();
  const [ctx, setCtx] = useState<Ctx>("normal");
  const [meet, setMeet] = useState<{ connected: boolean; count: number; hours: number }>({ connected: false, count: 0, hours: 0 });

  useEffect(() => {
    fetch("/api/gcal/day").then((r) => r.json()).then((d) => {
      const evs = (d.events || []) as { start: number; end: number }[];
      const hours = evs.reduce((a, e) => a + Math.max(0, (e.end - e.start)) / 3600_000, 0);
      setMeet({ connected: !!d.connected, count: evs.length, hours });
    }).catch(() => {});
  }, []);

  // Mis tareas accionables (asignadas a mí, no done, no en espera).
  const mine = useMemo(
    () => tasks.filter((t) => isAssignedTo(t, currentUserId) && isActionable(t.status) && !isDone(t.status)),
    [tasks, currentUserId],
  );

  // Prioridad: vencida > demorada > recién asignada; ajustada por contexto (peso).
  const scored = useMemo(() => {
    return [...mine].map((t) => {
      let s = 0;
      if (isOverdue(t)) s += 100;
      if (isDelayed(t)) s += 50;
      if (isFresh(t)) s += 15;
      if (/curso|progress/i.test(t.status)) s += 8; // ya empezada → termínala
      // Contexto: poca cabeza / en casa → preferir ligeras
      if (ctx === "ligero") s += t.weight === "Ligera" ? 25 : t.weight === "Pesada" ? -30 : 0;
      if (ctx === "foco") s += t.weight === "Pesada" ? 20 : t.weight === "Ligera" ? -10 : 5;
      return { t, s };
    }).sort((a, b) => b.s - a.s);
  }, [mine, ctx]);

  const overdue = mine.filter(isOverdue);
  const fresh = mine.filter(isFresh);
  const delayed = mine.filter(isDelayed);
  const loadMin = mine.reduce((a, t) => a + estimMin(t.weight), 0);

  // Mentalización del día
  const dayLine = useMemo(() => {
    if (meet.connected && meet.hours >= 3) return { icon: <CalendarClock size={16} />, text: `Día de juntas: ~${meet.hours.toFixed(1)}h en ${meet.count} reuniones. Protege 1 bloque para avanzar lo importante.` };
    if (meet.connected && meet.count > 0) return { icon: <CalendarClock size={16} />, text: `${meet.count} ${meet.count === 1 ? "junta" : "juntas"} hoy (~${meet.hours.toFixed(1)}h). Te queda buen rato para tareas — elige bien.` };
    if (mine.length === 0) return { icon: <Sparkles size={16} />, text: "Sin tareas pendientes asignadas. Buen momento para planear o cerrar pendientes internos." };
    return { icon: <Zap size={16} />, text: `Sin juntas hoy: modo foco. Tienes ~${formatDuration(loadMin * 60)} de trabajo por delante.` };
  }, [meet, mine.length, loadMin]);

  // Sugerencias para "tu próxima hora"
  const moves = useMemo(() => {
    const out: { kind: "cerrar" | "batch" | "paralelo"; title: string; why: string; tasks: Task[] }[] = [];
    const top = scored[0]?.t;
    const fits = top && estimMin(top.weight) <= 75;
    if (top && fits) out.push({ kind: "cerrar", title: `Cierra: ${top.name}`, why: isOverdue(top) ? "Está vencida" : isDelayed(top) ? "La traes atrasada" : "Cabe en una hora", tasks: [top] });
    const ligeras = scored.map((x) => x.t).filter((t) => t.weight === "Ligera").slice(0, 3);
    if (ligeras.length >= 2) out.push({ kind: "batch", title: `Avanza ${ligeras.length} ligeras`, why: "Poca cabeza: tareas chicas que sí cierras", tasks: ligeras });
    const pesada = scored.map((x) => x.t).find((t) => t.weight === "Pesada");
    const ligera = scored.map((x) => x.t).find((t) => t.weight !== "Pesada");
    if (pesada && ligera && pesada.id !== ligera.id) out.push({ kind: "paralelo", title: "Trabaja en paralelo", why: `Lanza "${pesada.name}" a la IA ✨ y avanza "${ligera.name}" a mano`, tasks: [pesada, ligera] });
    return out.slice(0, 3);
  }, [scored]);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
      <div className="curva-gradient flex items-center gap-2 px-5 py-3.5 text-white">
        <Sparkles size={18} />
        <h2 className="font-display text-lg font-bold">Tu día, con cabeza</h2>
      </div>

      <div className="space-y-4 p-5">
        {/* Mentalización */}
        <p className="flex items-start gap-2 text-sm text-ink">
          <span className="mt-0.5 text-curva-purple">{dayLine.icon}</span>
          <span>{dayLine.text}</span>
        </p>

        {/* Alertas */}
        {(overdue.length > 0 || delayed.length > 0 || fresh.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {overdue.length > 0 && <Alert icon={<AlertTriangle size={13} />} tone="rose" label={`${overdue.length} vencida${overdue.length > 1 ? "s" : ""}`} />}
            {delayed.length > 0 && <Alert icon={<Clock3 size={13} />} tone="amber" label={`${delayed.length} atrasada${delayed.length > 1 ? "s" : ""}`} />}
            {fresh.length > 0 && <Alert icon={<Sparkles size={13} />} tone="teal" label={`${fresh.length} nueva${fresh.length > 1 ? "s" : ""}`} />}
          </div>
        )}

        {/* Contexto */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-400">¿Cómo estás ahorita?</p>
          <div className="flex flex-wrap gap-1.5">
            <CtxChip active={ctx === "normal"} onClick={() => setCtx("normal")} icon={<Zap size={13} />}>Normal</CtxChip>
            <CtxChip active={ctx === "foco"} onClick={() => setCtx("foco")} icon={<Brain size={13} />}>Con foco</CtxChip>
            <CtxChip active={ctx === "ligero"} onClick={() => setCtx("ligero")} icon={<Clock3 size={13} />}>Poca cabeza</CtxChip>
          </div>
        </div>

        {/* Sugerencias para la próxima hora */}
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-400">Si tienes una hora…</p>
          {moves.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-zinc-400">
              No hay tareas accionables ahora. {mine.length === 0 ? "Crea una desde la barra de arriba." : "Marca alguna con peso para mejores sugerencias."}
            </p>
          ) : (
            <div className="space-y-2">
              {moves.map((m, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${m.kind === "paralelo" ? "bg-curva-indigo/10 text-curva-indigo" : "bg-curva-purple/10 text-curva-purple"}`}>
                    {m.kind === "paralelo" ? <Layers size={16} /> : m.kind === "batch" ? <ArrowRight size={16} /> : <Play size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{m.title}</p>
                    <p className="truncate text-xs text-zinc-500">{m.why}</p>
                  </div>
                  {m.kind === "paralelo" ? (
                    <button onClick={() => { toggleAI(m.tasks[0].id); switchTo(m.tasks[1].id); }} className="shrink-0 rounded-full bg-curva-indigo px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 active:scale-95">
                      Lanzar
                    </button>
                  ) : (
                    <button onClick={() => switchTo(m.tasks[0].id)} className="shrink-0 rounded-full bg-curva-purple px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 active:scale-95">
                      Empezar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Alert({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: "rose" | "amber" | "teal" }) {
  const cls = tone === "rose" ? "bg-rose-50 text-rose-600" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-curva-teal/10 text-curva-teal";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{icon}{label}</span>;
}

function CtxChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${active ? "bg-ink text-white" : "border border-line text-zinc-600 hover:border-zinc-300"}`}>
      {icon}{children}
    </button>
  );
}
