"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Clock3, History, Gauge, Calendar, Flag, Building2, Hand, Sparkles, ExternalLink } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { StatusPicker } from "@/components/StatusPicker";
import { EsfuerzoPicker } from "@/components/EsfuerzoPicker";
import { formatDuration, hhmmFromISO } from "@/lib/format";
import { openInNotion } from "@/lib/notion-url";
import { Avatar } from "@/components/Avatar";

type Rec = { id: string; taskId: string; person: string; start: string; minutes: number; mode?: "manual" | "ai" };
const DEFAULT_EST: Record<string, number> = { Ligera: 30, Media: 90, Pesada: 180 };

function dayLabel(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

// Detalle por tarea: su historial real de sesiones + cómo se compara con tu benchmark.
// Es el "genera data por tarea y aprende de eso" — abre desde cualquier TaskCard.
export function TaskDetailDrawer({ taskId, open, onClose }: { taskId: string; open: boolean; onClose: () => void }) {
  const { taskById, clientById, projectById, memberById, reload } = useData();
  const { currentUserId, isAdmin, sessionSecondsForTask: liveSecs } = useApp();

  const [records, setRecords] = useState<Rec[]>([]);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) { setShown(false); return; }
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    fetch("/api/time-entries").then((r) => r.json()).then((d) => setRecords(d.records || [])).catch(() => {});
    return () => { cancelAnimationFrame(id); window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  const task = taskById[taskId];

  const stats = useMemo(() => {
    const myName = currentUserId ? memberById[currentUserId]?.name : undefined;
    // Muro individuo/equipo: un NO-admin solo ve SUS propias sesiones de la tarea
    // (nunca el detalle nominal de compañeros). Admin ve todas.
    const taskRecs = records.filter((r) => r.taskId === taskId);
    const visible = isAdmin ? taskRecs : taskRecs.filter((r) => r.person === myName);
    const mine = visible.sort((a, b) => (b.start || "").localeCompare(a.start || ""));
    const totalMin = mine.reduce((a, r) => a + (r.minutes || 0), 0);
    const people = [...new Set(mine.map((r) => r.person).filter(Boolean))];
    // Benchmark personal por esfuerzo: promedio de minutos POR TAREA de ese peso.
    const perTask = new Map<string, number>();
    records.forEach((r) => { if (myName && r.person === myName) perTask.set(r.taskId, (perTask.get(r.taskId) || 0) + r.minutes); });
    const weight = task?.weight;
    let bench = 0;
    if (weight) {
      const samples = [...perTask.entries()].filter(([id]) => taskById[id]?.weight === weight).map(([, m]) => m).filter((m) => m > 0);
      bench = samples.length >= 2 ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : (DEFAULT_EST[weight] || 60);
    }
    return { mine, totalMin, sessions: mine.length, people, bench };
  }, [records, taskId, task, taskById, memberById, currentUserId, isAdmin]);

  if (!open || !mounted || !task) return null;

  const client = task.internal ? null : clientById[task.clientId] || clientById[projectById[task.projectId]?.clientId];
  const project = projectById[task.projectId];
  const assignees = [...new Set([
    ...(task.responsableIds?.length ? task.responsableIds : task.responsableId ? [task.responsableId] : []),
    ...(task.auxiliarIds || []),
  ])].map((id) => memberById[id]).filter(Boolean);
  const liveMin = Math.round(liveSecs(task.id) / 60);
  const totalWithLive = stats.totalMin + liveMin;
  const benchPct = stats.bench > 0 ? Math.round((totalWithLive / stats.bench) * 100) : 0;

  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-surface shadow-float transition-transform duration-300"
        style={{ transform: shown ? "translateX(0)" : "translateX(100%)", transitionTimingFunction: "var(--ease-curva)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <StatusPicker taskId={task.id} status={task.status} onChanged={reload} />
              <EsfuerzoPicker taskId={task.id} weight={task.weight} onChanged={reload} />
              {task.priority && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted"><Flag size={11} /> {task.priority}</span>}
            </div>
            <h2 className="font-display text-lg font-bold leading-tight text-fg">{task.name}</h2>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-surface-2"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Abrir en Notion (app de escritorio si la tienes, si no web) */}
          <button
            onClick={() => openInNotion(task.id)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 py-2.5 text-sm font-semibold text-fg transition hover:border-accent hover:text-accent focus-ring"
          >
            <ExternalLink size={15} /> Abrir en Notion
          </button>

          {/* Tiempo total + benchmark */}
          <div className="rounded-2xl border border-line bg-surface-2 p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tiempo total</p>
                <p className="tabular font-display text-2xl font-bold text-fg">{formatDuration(totalWithLive * 60)}</p>
              </div>
              <p className="text-xs text-muted">{stats.sessions} {stats.sessions === 1 ? "sesión" : "sesiones"}</p>
            </div>
            {task.weight && stats.bench > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span className="flex items-center gap-1"><Gauge size={12} /> Benchmark {task.weight.toLowerCase()}: ~{formatDuration(stats.bench * 60)}</span>
                  <span className={`font-semibold ${benchPct > 120 ? "text-rose-500" : benchPct > 80 ? "text-amber-500" : "text-curva-teal"}`}>{benchPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface">
                  <div className={`h-full rounded-full ${benchPct > 120 ? "bg-rose-500" : "bg-curva-teal"}`} style={{ width: `${Math.min(100, benchPct)}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="space-y-2.5 text-sm">
            {(client || task.internal) && <MetaRow icon={<Building2 size={15} />} label={task.internal ? "Interno (CURVA)" : client?.name || "—"} hint={project?.name} />}
            {task.dueDate && <MetaRow icon={<Calendar size={15} />} label={`Vence ${dayLabel(task.dueDate)}`} />}
            {assignees.length > 0 && (
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-muted"><Hand size={15} /></span>
                <span className="flex flex-wrap -space-x-1.5">{assignees.map((m) => <Avatar key={m!.id} member={m!} size={22} />)}</span>
                <span className="min-w-0 flex-1 text-muted">{assignees.map((m) => m!.name).join(", ")}</span>
              </div>
            )}
          </div>

          {/* Historial de sesiones */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted"><History size={13} /> Historial</p>
            {stats.mine.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line py-5 text-center text-xs text-muted">Sin sesiones registradas aún. Dale play para empezar a medirla.</p>
            ) : (
              <div className="space-y-1.5">
                {stats.mine.slice(0, 30).map((r) => {
                  const m = memberById[Object.keys(memberById).find((id) => memberById[id]?.name === r.person) || ""];
                  return (
                    <div key={r.id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
                      {m ? <Avatar member={m} size={22} /> : <span className="h-[22px] w-[22px] rounded-full bg-surface-2" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-fg">{r.person || "—"}</p>
                        <p className="text-[11px] text-muted">{dayLabel(r.start)} · {hhmmFromISO(r.start)}</p>
                      </div>
                      {r.mode === "ai" && <Sparkles size={12} className="text-curva-indigo" />}
                      <span className="tabular flex items-center gap-1 text-xs font-semibold text-fg"><Clock3 size={12} className="text-muted" /> {formatDuration((r.minutes || 0) * 60)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MetaRow({ icon, label, hint }: { icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-muted">{icon}</span>
      <span className="text-fg">{label}</span>
      {hint && <span className="text-muted">· {hint}</span>}
    </div>
  );
}
