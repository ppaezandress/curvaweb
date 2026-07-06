"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Play, Send, Clock3, AlertTriangle, Zap, ChevronDown } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { isActionable, isDone, isAssignedTo } from "@/lib/task-status";
import { dayKey, computeStreak } from "@/lib/culture";
import { suggest, answer, type CurviContext, type CurviRec } from "@/lib/curvi/engine";
import { PILOT } from "@/lib/pilot-flags";

type Meeting = { connected: boolean; count: number; hours: number };

// Curvi: tu copiloto. Mentaliza el día, propone un plan concreto con el porqué, y
// responde dudas de hábitos. `compact` lo vuelve una tira slim (para no robar espacio
// en páginas como Tareas), expandible a pedido.
export function CurviPanel({ compact = false }: { compact?: boolean }) {
  const { currentUserId, switchTo, loggedSecondsToday } = useApp();
  const { tasks, memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [records, setRecords] = useState<CurviRec[]>([]);
  const [meeting, setMeeting] = useState<Meeting>({ connected: false, count: 0, hours: 0 });
  const [ready, setReady] = useState(false);
  const [ask, setAsk] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    if (!me?.name) return;
    Promise.all([
      fetch("/api/time-entries").then((r) => r.json()).catch(() => ({ records: [] })),
      fetch("/api/gcal/day").then((r) => r.json()).catch(() => ({ connected: false, events: [] })),
    ]).then(([te, cal]) => {
      const recs: CurviRec[] = (te.records || [])
        .filter((r: { person?: string }) => (r.person || "").trim() === me.name)
        .map((r: { taskId: string; start: string; minutes: number }) => ({ taskId: r.taskId, start: r.start, minutes: r.minutes }));
      setRecords(recs);
      const evs = (cal.events || []) as { start: number; end: number }[];
      const hours = evs.reduce((a, e) => a + Math.max(0, e.end - e.start) / 3_600_000, 0);
      setMeeting({ connected: !!cal.connected, count: evs.length, hours });
      setReady(true);
    });
  }, [me?.name]);

  const ctx: CurviContext = useMemo(() => {
    const mine = tasks.filter((t) => isAssignedTo(t, currentUserId) && isActionable(t.status) && !isDone(t.status));
    const taskWeightById: Record<string, "Ligera" | "Media" | "Pesada" | undefined> = {};
    tasks.forEach((t) => { taskWeightById[t.id] = t.weight; });
    const days = new Set<string>();
    records.forEach((r) => { if (r.start) days.add(dayKey(new Date(r.start).getTime())); });
    if (loggedSecondsToday > 0) days.add(dayKey(Date.now()));
    return {
      now: Date.now(), tasks: mine, records, taskWeightById, meeting,
      streak: computeStreak(days), loggedTodayMin: Math.round(loggedSecondsToday / 60),
    };
  }, [tasks, currentUserId, records, meeting, loggedSecondsToday]);

  const sug = useMemo(() => suggest(ctx), [ctx]);

  const onAsk = (text?: string) => {
    const q = (text ?? ask).trim();
    if (!q) return;
    setReply(answer(q, ctx, sug));
    setAsk("");
    setExpanded(true);
  };

  const top = sug.plan[0];
  const { overdue, delayed, soon } = sug.nudges;

  // ── Tira compacta (colapsada): orbe + brief + top move + expandir ──
  if (compact && !expanded) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-accent/25 bg-surface px-4 py-2.5 shadow-soft">
        <span className="curva-gradient breathe inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-white"><Sparkles size={15} /></span>
        <div className="min-w-0 flex-1">
          {top ? (
            <p className="truncate text-sm text-fg"><span className="font-semibold">Curvi:</span> {top.title.replace(/:.*/, "")} — {top.title.split(": ").slice(1).join(": ")} <span className="text-muted">· {top.reason.toLowerCase()}</span></p>
          ) : (
            <p className="truncate text-sm text-muted">{ready ? sug.brief : "Leyendo tu día…"}</p>
          )}
        </div>
        {top && (
          <button onClick={() => switchTo(top.taskId)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 focus-ring"><Play size={12} fill="currentColor" /> Empezar</button>
        )}
        <button onClick={() => setExpanded(true)} className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-surface-2 focus-ring" aria-label="Abrir Curvi"><ChevronDown size={16} /></button>
      </div>
    );
  }

  // ── Panel completo ──
  return (
    <section className="overflow-hidden rounded-hero border border-accent/25 bg-surface shadow-soft">
      <div className="flex items-center gap-3 border-b border-line/70 px-5 py-4">
        <span className="curva-gradient breathe inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-card text-white shadow-sm"><Sparkles size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-bold text-fg">
            <span className="font-brand text-[1.1rem] font-semibold">Curvi</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold ${sug.energy.isPeak ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>{sug.energy.emoji} {sug.energy.label}</span>
          </p>
          <p className="truncate text-sm text-muted">{ready ? sug.brief : "Leyendo tu día…"}</p>
        </div>
        {compact && <button onClick={() => setExpanded(false)} className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-surface-2 focus-ring" aria-label="Cerrar Curvi"><ChevronDown size={16} className="rotate-180" /></button>}
      </div>

      <div className="space-y-4 p-5">
        {(overdue > 0 || delayed > 0 || soon > 0) && (
          <div className="flex flex-wrap gap-2">
            {overdue > 0 && <Nudge icon={<AlertTriangle size={12} />} tone="rose" label={`${overdue} vencida${overdue === 1 ? "" : "s"}`} />}
            {delayed > 0 && <Nudge icon={<Clock3 size={12} />} tone="amber" label={`${delayed} atrasada${delayed === 1 ? "" : "s"}`} />}
            {soon > 0 && <Nudge icon={<Zap size={12} />} tone="indigo" label={`${soon} vence${soon === 1 ? "" : "n"} pronto`} />}
          </div>
        )}

        {sug.plan.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted">Tu próxima hora</p>
            {sug.plan.map((m) => (
              <div key={m.taskId} className="group flex items-center gap-3 rounded-card border border-line p-3 transition hover:border-accent/40">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.tone === "urgent" ? "bg-danger" : m.tone === "normal" ? "bg-accent" : "bg-success"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{m.title}</p>
                  <p className="truncate text-xs text-muted">{m.reason} · ~{m.estMin} min</p>
                </div>
                <button onClick={() => switchTo(m.taskId)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 focus-ring"><Play size={13} fill="currentColor" /> Empezar</button>
              </div>
            ))}
          </div>
        ) : (
          ready && <p className="rounded-card border border-dashed border-line py-6 text-center text-sm text-muted">Sin pendientes accionables. Crea una tarea arriba o toma un respiro 🌿</p>
        )}

        {/* Q&A con Curvi — gateado off en el piloto (probamos si el equipo lo pide). */}
        {PILOT.curviChat && (
          <div className="rounded-card bg-surface-2 p-3">
            {reply && (
              <div className="mb-2 flex gap-2 rounded-control bg-surface p-3 text-sm text-fg shadow-soft">
                <Sparkles size={15} className="mt-0.5 shrink-0 text-accent" /><p>{reply}</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }} placeholder="Pregúntale a Curvi…" className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-muted focus-ring" />
              <button onClick={() => onAsk()} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition hover:bg-accent focus-ring" aria-label="Preguntar"><Send size={15} /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["¿Con qué empiezo?", "¿Mi mejor hora?", "¿Cómo mejoro mi enfoque?"].map((c) => (
                <button key={c} onClick={() => onAsk(c)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-fg">{c}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Nudge({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: "rose" | "amber" | "indigo" }) {
  const cls = tone === "rose" ? "bg-danger/10 text-danger" : tone === "amber" ? "bg-warn/10 text-warn" : "bg-accent/10 text-accent";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{icon}{label}</span>;
}
