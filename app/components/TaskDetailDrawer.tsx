"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X, Clock3, History, Gauge, Calendar, Flag, Building2, Hand, Sparkles, ExternalLink, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { backdrop, DUR_BASE, EASE_CURVA } from "@/lib/motion";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { StatusPicker } from "@/components/StatusPicker";
import { EsfuerzoPicker } from "@/components/EsfuerzoPicker";
import { formatDuration, hhmmFromISO } from "@/lib/format";
import { dueDateLabel } from "@/lib/date";
import { openInNotion } from "@/lib/notion-url";
import { openManualEntry } from "@/lib/manual-entry";
import { useOverlay } from "@/lib/use-overlay";
import { Avatar } from "@/components/Avatar";

type Rec = { id: string; taskId: string; person: string; start: string; minutes: number; mode?: "manual" | "ai"; origin?: "timer" | "manual" };
const DEFAULT_EST: Record<string, number> = { Ligera: 30, Media: 90, Pesada: 180 };

// Fecha de vencimiento sin correrse por zona horaria (usa parseDateOnly).
const dayLabel = (iso: string) => dueDateLabel(iso);

// Detalle por tarea: su historial real de sesiones + cómo se compara con tu benchmark.
// Es el "genera data por tarea y aprende de eso" — abre desde cualquier TaskCard.
export function TaskDetailDrawer({ taskId, open, onClose }: { taskId: string; open: boolean; onClose: () => void }) {
  const { taskById, clientById, projectById, memberById, reload, recentEntries, removeRecentEntry } = useData();
  const { currentUserId, isAdmin, sessionSecondsForTask: liveSecs } = useApp();

  const [records, setRecords] = useState<Rec[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // "Quitar tiempo": qué sesión está pidiendo confirmación y cuál se está borrando.
  const myName = currentUserId ? memberById[currentUserId]?.name : undefined;
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Archiva la sesión en Notion (endpoint DELETE) y refresca el total de la tarea. Optimista:
  // la quitamos de la vista al instante y la devolvemos si el servidor falla.
  const deleteEntry = async (id: string) => {
    setBusyId(id);
    const snapshot = records;
    setRecords((rs) => rs.filter((r) => r.id !== id));
    removeRecentEntry(id);
    try {
      const res = await fetch(`/api/time-entries?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setRecords(snapshot);
        toast(j.error || "No se pudo quitar el tiempo", { tone: "error" });
      } else {
        toast("Tiempo quitado de la tarea");
        reload(); // el rollup "Horas registradas" baja en el próximo dato fresco de Notion
      }
    } catch {
      setRecords(snapshot);
      toast("No se pudo quitar el tiempo", { tone: "error" });
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  // Escape + scroll-lock (patrón seguro compartido; ver lib/use-overlay.ts).
  useOverlay(open, onClose);

  // Fetch del historial: SOLO al abrir (deps [open]). La animación de entrada/salida
  // ahora la maneja Motion (AnimatePresence), ya no un estado `shown` + rAF.
  // Antes esto dependía de `onClose` inline → con TaskCard re-renderizando cada segundo
  // por el cronómetro, re-hacía fetch(/api/time-entries) CADA SEGUNDO y trababa la app.
  useEffect(() => {
    if (!open) return;
    fetch("/api/time-entries").then((r) => r.json()).then((d) => setRecords(d.records || [])).catch(() => {});
  }, [open]);

  const task = taskById[taskId];

  const stats = useMemo(() => {
    const myName = currentUserId ? memberById[currentUserId]?.name : undefined;
    // Mezcla lo que trajo Notion con lo recién creado en esta sesión (dedupe por id): un
    // registro manual aparece al instante aunque Notion aún no lo haya indexado.
    const known = new Set(records.map((r) => r.id));
    const all = [...records, ...recentEntries.filter((r) => !known.has(r.id))];
    // Muro individuo/equipo: un NO-admin solo ve SUS propias sesiones de la tarea
    // (nunca el detalle nominal de compañeros). Admin ve todas.
    const taskRecs = all.filter((r) => r.taskId === taskId);
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
  }, [records, recentEntries, taskId, task, taskById, memberById, currentUserId, isAdmin]);

  // No cerramos con `!open` para que AnimatePresence pueda animar la SALIDA; el gate de
  // `open` vive dentro del portal. `task` sigue definida durante el cierre (no se desmonta).
  if (!mounted || !task) return null;

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
    <AnimatePresence>
      {open && (
        <motion.div
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="fixed inset-0 z-50 flex justify-end bg-ink/30"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: DUR_BASE, ease: EASE_CURVA }}
            className="flex h-full w-full max-w-md flex-col bg-[var(--surface-solid)] shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <StatusPicker taskId={task.id} status={task.status} onChanged={reload} />
              <EsfuerzoPicker taskId={task.id} weight={task.weight} onChanged={reload} />
              {task.priority && <span className="inline-flex items-center gap-1 text-caption font-semibold text-muted"><Flag size={11} /> {task.priority}</span>}
            </div>
            <h2 className="font-display text-lg font-bold leading-tight text-fg">{task.name}</h2>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-surface-2"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Acciones: registrar tiempo a mano (para tareas ya trabajadas sin cronómetro) + Notion */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { openManualEntry(task.id); onClose(); }}
              className="flex w-full items-center justify-center gap-2 rounded-control bg-accent py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-ring"
            >
              <Clock3 size={15} /> Registrar tiempo
            </button>
            <button
              onClick={() => openInNotion(task.id)}
              className="flex w-full items-center justify-center gap-2 rounded-control border border-line bg-surface-2 py-2.5 text-sm font-semibold text-fg transition hover:border-accent hover:text-accent focus-ring"
            >
              <ExternalLink size={15} /> Notion
            </button>
          </div>

          {/* Tiempo total + benchmark */}
          <div className="rounded-card border border-line bg-surface-2 p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold text-muted">Tiempo total</p>
                <p className="tabular font-display text-2xl font-bold text-fg">{formatDuration(totalWithLive * 60)}</p>
              </div>
              <p className="text-xs text-muted">{stats.sessions} {stats.sessions === 1 ? "sesión" : "sesiones"}</p>
            </div>
            {task.weight && stats.bench > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span className="flex items-center gap-1"><Gauge size={12} /> Benchmark {task.weight.toLowerCase()}: ~{formatDuration(stats.bench * 60)}</span>
                  <span className={`font-semibold ${benchPct > 120 ? "text-danger" : benchPct > 80 ? "text-warn" : "text-success"}`}>{benchPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface">
                  <div className={`h-full rounded-full ${benchPct > 120 ? "bg-danger" : "bg-success"}`} style={{ width: `${Math.min(100, benchPct)}%` }} />
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
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted"><History size={13} /> Historial</p>
            {stats.mine.length === 0 ? (
              <div className="rounded-control border border-dashed border-line py-5 text-center">
                <p className="text-xs text-muted">Sin sesiones aún. Dale play, o registra el tiempo que ya trabajaste.</p>
                <button onClick={() => { openManualEntry(task.id); onClose(); }} className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 focus-ring">
                  <Clock3 size={13} /> Registrar tiempo a mano
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {stats.mine.slice(0, 30).map((r) => {
                  const m = memberById[Object.keys(memberById).find((id) => memberById[id]?.name === r.person) || ""];
                  return (
                    <div key={r.id} className="flex items-center gap-2.5 rounded-control border border-line px-3 py-2">
                      {m ? <Avatar member={m} size={22} /> : <span className="h-[22px] w-[22px] rounded-full bg-surface-2" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-fg">{r.person || "—"}</p>
                        <p className="text-caption text-muted">{dayLabel(r.start)} · {hhmmFromISO(r.start)}</p>
                      </div>
                      {r.mode === "ai"
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-caption font-semibold text-accent"><Sparkles size={11} /> IA</span>
                        : r.origin === "manual"
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-caption font-medium text-muted"><Pencil size={10} /> A mano</span>
                          : null}
                      <span className="tabular flex items-center gap-1 text-xs font-semibold text-fg"><Clock3 size={12} className="text-muted" /> {formatDuration((r.minutes || 0) * 60)}</span>
                      {/* Quitar tiempo: solo tus propias sesiones (o admin). Confirmación inline
                          para no borrar por error; sin diálogo nativo (bloquea la app). */}
                      {(isAdmin || r.person === myName) && (
                        confirmId === r.id ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <button onClick={() => deleteEntry(r.id)} disabled={busyId === r.id}
                              className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-1 text-caption font-semibold text-danger transition hover:bg-danger/20 focus-ring disabled:opacity-50">
                              {busyId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Quitar
                            </button>
                            <button onClick={() => setConfirmId(null)} disabled={busyId === r.id}
                              className="rounded-full px-2 py-1 text-caption font-medium text-muted transition hover:bg-surface-2 focus-ring">
                              No
                            </button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmId(r.id)}
                            className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger focus-ring"
                            aria-label="Quitar esta sesión" title="Quitar esta sesión">
                            <Trash2 size={13} />
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
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
