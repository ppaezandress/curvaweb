"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Check, Clock, Minus, Plus, ArrowRight, AlertTriangle,
  Focus, Phone, MapPin, Users, Search, MoreHorizontal, type LucideIcon,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { isDone } from "@/lib/task-status";
import { formatDuration } from "@/lib/format";
import { dayKey } from "@/lib/streaks";
import { Modal, Field, inputCls } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";

const AREAS: { label: string; icon: LucideIcon }[] = [
  { label: "Trabajo enfocado", icon: Focus },
  { label: "Llamada", icon: Phone },
  { label: "Visita física", icon: MapPin },
  { label: "Reunión", icon: Users },
  { label: "Investigación", icon: Search },
  { label: "Otro", icon: MoreHorizontal },
];
const DUR_PRESETS = [15, 30, 45, 60, 90, 120];
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = (t: number) => `${pad(Math.floor(t / 60) % 24)}:${pad(((t % 60) + 60) % 60)}`;
const labelHour = (min: number) => { const h = Math.floor(min / 60) % 24; const ap = h < 12 ? "a" : "p"; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}${ap}`; };
const labelHourMin = (min: number) => { const h = Math.floor(min / 60) % 24; const m = ((min % 60) + 60) % 60; const ap = h < 12 ? "a" : "p"; const h12 = h % 12 === 0 ? 12 : h % 12; return m === 0 ? `${h12}${ap}` : `${h12}:${pad(m)}${ap}`; };

// Ventana de la timeline interactiva: 6:00 → 24:00.
const WIN_S = 6 * 60;
const WIN_E = 24 * 60;
const SPAN = WIN_E - WIN_S;
const pct = (m: number) => Math.max(0, Math.min(100, ((m - WIN_S) / SPAN) * 100));
const BANDS = [
  { from: 6 * 60, to: 12 * 60, cls: "bg-warn dark:bg-warn/10" },   // mañana
  { from: 12 * 60, to: 18 * 60, cls: "bg-sky-50 dark:bg-sky-400/10" },      // tarde
  { from: 18 * 60, to: 24 * 60, cls: "bg-indigo-50 dark:bg-indigo-400/10" }, // noche
];
const TICKS = [6, 9, 12, 15, 18, 21, 24].map((h) => h * 60);

export function ManualEntryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUserId } = useApp();
  const { tasks, clients, clientById, members, memberById, reload } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [area, setArea] = useState("Trabajo enfocado");
  const [clientId, setClientId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [taskFocused, setTaskFocused] = useState(false);
  // Fecha LOCAL (no toISOString, que en UTC salta a "mañana" después de las 18:00 en México).
  const [date, setDate] = useState(() => dayKey(Date.now()));
  // Horario: de qué hora a qué hora (la duración se deriva). Default: la última hora.
  const [startTime, setStartTime] = useState(() => { const d = new Date(); d.setMinutes(Math.floor(d.getMinutes() / 5) * 5 - 60, 0, 0); return hhmm(d); });
  const [endTime, setEndTime] = useState(() => { const d = new Date(); d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0); return hhmm(d); });
  const minutes = useMemo(() => toMin(endTime) - toMin(startTime), [startTime, endTime]);
  const valid = minutes > 0;
  // asistentes seleccionados; null = duración completa, número = "se fue antes"
  const [attendees, setAttendees] = useState<Record<string, number | null>>(
    () => (me ? { [me.name]: null } : {}),
  );
  const [earlyFor, setEarlyFor] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // [3] Anti doble-registro: cargamos los registros existentes para avisar si el nuevo
  // se encima con otro en la misma tarea (p. ej. una junta que otra persona ya registró).
  const [records, setRecords] = useState<{ taskId: string; person: string; start: string; minutes: number }[]>([]);
  const [dupMsg, setDupMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    fetch("/api/time-entries").then((r) => r.json()).then((d) => setRecords(d.records || [])).catch(() => {});
  }, [open]);
  // Al cambiar tarea/fecha/horario, re-evaluamos (limpia el aviso previo).
  useEffect(() => { setDupMsg(null); }, [taskId, date, startTime, endTime]);

  // Ajuste rápido ±15 min (sin cruzar el otro extremo).
  const bump = (which: "start" | "end", delta: number) => {
    if (which === "start") setStartTime(fromMin(Math.max(0, Math.min(toMin(startTime) + delta, toMin(endTime)))));
    else setEndTime(fromMin(Math.min(24 * 60 - 1, Math.max(toMin(endTime) + delta, toMin(startTime)))));
  };
  const applyPreset = (m: number) => setEndTime(fromMin(Math.min(toMin(startTime) + m, 24 * 60 - 1)));
  const setEndNow = () => { const d = new Date(); d.setMinutes(Math.round(d.getMinutes() / 5) * 5, 0, 0); setEndTime(hhmm(d)); };
  // La timeline interactiva ajusta ambos extremos a la vez.
  const setRange = (s: number, e: number) => { setStartTime(fromMin(s)); setEndTime(fromMin(e)); };

  // Con texto: filtra. Sin texto: muestra tareas recientes (no terminadas primero,
  // más nuevas arriba) para poder elegir sin acordarse del nombre exacto.
  const taskMatches = useMemo(() => {
    const base = clientId ? tasks.filter((t) => t.clientId === clientId) : tasks;
    const q = taskQuery.trim().toLowerCase();
    if (q) return base.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 8);
    return [...base]
      .sort((a, b) => Number(isDone(a.status)) - Number(isDone(b.status)) || (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 8);
  }, [taskQuery, tasks, clientId]);

  const selectedTask = taskId ? tasks.find((t) => t.id === taskId) : undefined;

  // Completitud: al elegir una tarea, hereda su cliente automáticamente (mata "Sin cliente").
  useEffect(() => {
    if (selectedTask && !selectedTask.internal && selectedTask.clientId) setClientId(selectedTask.clientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask?.id]);

  // Si `me` carga async (después de montar el modal), siémbralo al abrir para que
  // "Guardar" nunca salga con 0 personas y el registro se pierda en silencio.
  useEffect(() => {
    if (open && me && Object.keys(attendees).length === 0) setAttendees({ [me.name]: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, me]);

  const AreaIcon = AREAS.find((a) => a.label === area)?.icon ?? Focus;
  const peopleCount = Object.keys(attendees).length;

  const toggleAttendee = (name: string) =>
    setAttendees((prev) => {
      const next = { ...prev };
      if (name in next) { delete next[name]; }
      else next[name] = null;
      return next;
    });

  const save = async () => {
    if (saving || !valid) return;
    const list = Object.keys(attendees).map((name) => ({
      name,
      minutes: earlyFor.has(name) && attendees[name] ? (attendees[name] as number) : minutes,
    }));
    if (list.length === 0) return;
    const startedAt = new Date(`${date}T${startTime}:00`).getTime();
    const endedAt = new Date(`${date}T${endTime}:00`).getTime();
    // [3] Si hay una tarea elegida y ya existe un registro que se encima con este
    // horario, avisamos una vez antes de crear un duplicado. El 2º clic procede.
    if (taskId && !dupMsg) {
      const clash = records.find((r) => {
        if (r.taskId !== taskId || !r.start) return false;
        const rs = new Date(r.start).getTime();
        const re = rs + r.minutes * 60000;
        return rs < endedAt && re > startedAt;
      });
      if (clash) {
        setDupMsg(`Ya hay un registro en esta tarea que se encima con ese horario (${clash.person || "alguien"}). ¿Registrar de todos modos?`);
        return;
      }
    }
    setSaving(true);
    try {
      const r = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: taskId || undefined,
          clientId: clientId || undefined,
          taskName: taskId ? undefined : area,
          area,
          startedAt,
          endedAt,
          attendees: list,
        }),
      });
      const ok = r.ok && (await r.json().catch(() => ({}))).ok !== false;
      // Refrescar tareas para que el total (rollup "Horas registradas" de Notion) se
      // actualice de inmediato. Un 2º reload diferido cubre el lag del rollup.
      if (ok) {
        await reload();
        setTimeout(() => { reload(); }, 2000);
      }
      onClose();
      setTaskId(""); setTaskQuery("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar tiempo"
      footer={
        <div className="space-y-2.5">
          {dupMsg && (
            <div className="flex items-start gap-2 rounded-control bg-warn/10 px-3 py-2 text-xs font-medium text-warn dark:text-warn">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{dupMsg}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <AreaIcon size={13} className="text-muted" />
              <span className="truncate">{area}</span>
              <span className="text-muted/70 dark:text-muted">·</span>
              <span className={valid ? "tabular font-semibold text-fg" : "text-danger"}>{valid ? formatDuration(minutes * 60) : "—"}</span>
              <span className="text-muted/70 dark:text-muted">·</span>
              <span>{peopleCount} {peopleCount === 1 ? "persona" : "personas"}</span>
            </span>
            <button onClick={save} disabled={saving || !valid || peopleCount === 0} className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-40 ${dupMsg ? "bg-warn shadow-warn/20" : "bg-accent shadow-accent/20"}`}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {dupMsg ? "Registrar de todos modos" : "Guardar"}
            </button>
          </div>
        </div>
      }
    >
      {/* Tipo de actividad — chips con icono */}
      <Field label="¿Qué tipo de actividad?">
        <div className="flex flex-wrap gap-1.5">
          {AREAS.map(({ label, icon: Icon }) => {
            const on = area === label;
            return (
              <button key={label} onClick={() => setArea(label)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${on ? "bg-ink text-white shadow-sm" : "border border-line text-muted hover:border-muted/40"}`}>
                <Icon size={13} className={on ? "text-white" : "text-muted"} /> {label}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Horario — ¿de qué hora a qué hora? con mini-timeline visual */}
      <Field label="¿De qué hora a qué hora?">
        <div className="rounded-card border border-line bg-surface-2 p-3.5 shadow-soft">
          <div className="flex items-end gap-2">
            <TimePart label="Inicio" value={startTime} onBump={(d) => bump("start", d)} onChange={setStartTime} />
            <ArrowRight size={18} className="mb-3 shrink-0 text-muted/70 dark:text-muted" />
            <TimePart label="Fin" value={endTime} onBump={(d) => bump("end", d)} onChange={setEndTime} accent />
          </div>

          {/* Timeline interactiva: arrastra los extremos o el bloque entero */}
          <Timeline startMin={toMin(startTime)} endMin={toMin(endTime)} valid={valid} onChange={setRange} />

          {/* Duración derivada (con micro-pop) + "Terminó ahora" */}
          <div className="mt-3 flex items-center justify-between gap-2">
            {valid ? (
              <span key={minutes} className="modal-pop inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent">
                <Clock size={14} /> {formatDuration(minutes * 60)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 dark:bg-danger/15 px-3 py-1.5 text-sm font-semibold text-danger">
                El fin debe ser después del inicio
              </span>
            )}
            <button onClick={setEndNow} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent active:scale-95">
              Terminó ahora
            </button>
          </div>

          {/* Atajos: fijan el fin = inicio + X */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-caption font-medium text-muted">Duró:</span>
            {DUR_PRESETS.map((m) => {
              const on = valid && minutes === m;
              return (
                <button key={m} onClick={() => applyPreset(m)} className={`rounded-full px-2.5 py-1 text-caption font-semibold transition active:scale-95 ${on ? "bg-accent text-white" : "border border-line bg-surface text-muted hover:border-accent hover:text-accent"}`}>
                  {m < 60 ? `${m}m` : `${m / 60}h${m % 60 ? " " + (m % 60) + "m" : ""}`}
                </button>
              );
            })}
          </div>
        </div>
      </Field>

      {/* Cliente + tarea (buscador) */}
      <div className="grid gap-0 sm:grid-cols-2 sm:gap-4">
        <Field label="Cliente">
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setTaskId(""); setTaskQuery(""); }} className={inputCls}>
            <option value="">— Sin cliente —</option>
            {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
        <Field label="Tarea (opcional)">
          {selectedTask ? (
            <button onClick={() => { setTaskId(""); setTaskQuery(""); }} className="flex w-full items-center justify-between rounded-control border border-accent/40 bg-accent/5 px-3 py-2.5 text-left text-sm">
              <span className="truncate text-fg">{selectedTask.name}</span>
              <span className="ml-2 shrink-0 text-xs text-accent">cambiar</span>
            </button>
          ) : (
            <div className="relative">
              <input
                value={taskQuery}
                onChange={(e) => setTaskQuery(e.target.value)}
                onFocus={() => setTaskFocused(true)}
                onBlur={() => setTimeout(() => setTaskFocused(false), 150)}
                placeholder="Buscar o elegir tarea reciente…"
                className={inputCls}
              />
              {(taskFocused || taskQuery) && taskMatches.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-control border border-line bg-surface shadow-float">
                  {!taskQuery && <p className="px-3 pt-2 pb-1 text-caption font-semibold text-muted">Recientes</p>}
                  {taskMatches.map((t) => {
                    const cl = clientById[t.clientId];
                    return (
                      <button key={t.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { setTaskId(t.id); setTaskQuery(""); setTaskFocused(false); }} className="block w-full px-3 py-2 text-left hover:bg-surface-2">
                        <span className="block truncate text-sm text-fg">{t.name}</span>
                        {cl && <span className="block truncate text-caption text-muted">{cl.name}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Field>
      </div>

      <Field label="Fecha">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </Field>

      {/* Asistentes — 1 toque; minutos solo si "se fue antes" */}
      <Field label="¿Quién participó?">
        <div className="flex flex-wrap gap-1.5">
          {members.filter((m) => m.name && m.name !== "—").map((m) => {
            const on = m.name in attendees;
            return (
              <button key={m.id} onClick={() => toggleAttendee(m.name)} className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-medium transition active:scale-95 ${on ? "bg-accent/10 text-accent ring-1 ring-accent/40" : "border border-line text-muted hover:border-muted/40"}`}>
                <Avatar member={m} size={20} /> {m.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
        {/* "se fue antes" por asistente seleccionado */}
        {peopleCount > 0 && (
          <div className="mt-2 space-y-1">
            {Object.keys(attendees).map((name) => {
              const early = earlyFor.has(name);
              return (
                <div key={name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">{name}</span>
                  {early ? (
                    <span className="inline-flex items-center gap-1">
                      <input type="number" min={1} max={valid ? minutes : undefined} value={attendees[name] ?? (valid ? minutes : 0)} onChange={(e) => setAttendees((p) => ({ ...p, [name]: Number(e.target.value) }))} className="w-16 rounded-lg border border-line px-2 py-0.5 text-right tabular outline-none focus:border-accent" />
                      <span className="text-muted">min</span>
                      <button onClick={() => setEarlyFor((p) => { const n = new Set(p); n.delete(name); return n; })} className="text-muted hover:text-muted">↺</button>
                    </span>
                  ) : (
                    <button onClick={() => setEarlyFor((p) => new Set(p).add(name))} className="text-muted underline-offset-2 hover:text-accent hover:underline">se fue antes</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Field>
    </Modal>
  );
}

/* Campo de hora grande con ajuste rápido −15 / +15 min y picker nativo al tocar la hora. */
function TimePart({
  label,
  value,
  onBump,
  onChange,
  accent,
}: {
  label: string;
  value: string;
  onBump: (delta: number) => void;
  onChange: (v: string) => void;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-center text-caption font-semibold text-muted">{label}</p>
      <div className="flex items-center gap-1 rounded-control border border-line bg-surface p-1 transition focus-within:border-accent/50">
        <button
          onClick={() => onBump(-15)}
          className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg active:scale-90 focus-ring"
          aria-label={`${label}: 15 minutos menos`}
        >
          <Minus size={16} />
        </button>
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Hora de ${label.toLowerCase()}`}
          className={`tabular w-full min-w-0 bg-transparent text-center font-display text-lg font-bold outline-none ${accent ? "text-accent" : "text-fg"}`}
        />
        <button
          onClick={() => onBump(15)}
          className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg active:scale-90 focus-ring"
          aria-label={`${label}: 15 minutos más`}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

/* Timeline interactiva del día: arrastra los extremos (redimensionar) o el bloque (mover). */
function Timeline({
  startMin,
  endMin,
  valid,
  onChange,
}: {
  startMin: number;
  endMin: number;
  valid: boolean;
  onChange: (s: number, e: number) => void;
}) {
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ mode: "start" | "end" | "move"; offset: number } | null>(null);
  const [nowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });

  const xToMin = (clientX: number) => {
    if (!track) return startMin;
    const r = track.getBoundingClientRect();
    const m = Math.round((WIN_S + ((clientX - r.left) / r.width) * SPAN) / 5) * 5;
    return Math.max(WIN_S, Math.min(WIN_E, m));
  };
  const onDown = (e: React.PointerEvent) => {
    const which = (e.target as HTMLElement).closest("[data-h]")?.getAttribute("data-h");
    if (!which) return;
    const m = xToMin(e.clientX);
    setDrag({ mode: which as "start" | "end" | "move", offset: which === "move" ? m - startMin : 0 });
    track?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const m = xToMin(e.clientX);
    if (drag.mode === "start") onChange(Math.min(m, endMin - 5), endMin);
    else if (drag.mode === "end") onChange(startMin, Math.max(m, startMin + 5));
    else { const dur = endMin - startMin; const ns = Math.max(WIN_S, Math.min(m - drag.offset, WIN_E - dur)); onChange(ns, ns + dur); }
  };
  const onUp = (e: React.PointerEvent) => { try { track?.releasePointerCapture(e.pointerId); } catch { /* */ } setDrag(null); };

  const left = pct(startMin), right = pct(endMin), width = Math.max(0, right - left);
  const nowVisible = nowMin >= WIN_S && nowMin <= WIN_E;

  return (
    <div className="mt-4 select-none">
      {/* etiquetas de hora sobre los extremos — cuando el intervalo es chico se
          combinan en una sola (evita que los numeritos se encimen). */}
      <div className="relative mb-1 h-4 text-caption font-bold tabular">
        {right - left < 16 ? (
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min(88, Math.max(12, (left + right) / 2))}%` }}>
            <span className="text-fg">{labelHourMin(startMin)}</span>
            <span className="text-muted"> → </span>
            <span className="text-accent">{labelHourMin(endMin)}</span>
          </span>
        ) : (
          <>
            <span className="absolute -translate-x-1/2 whitespace-nowrap text-fg" style={{ left: `${left}%` }}>{labelHourMin(startMin)}</span>
            <span className="absolute -translate-x-1/2 whitespace-nowrap text-accent" style={{ left: `${right}%` }}>{labelHourMin(endMin)}</span>
          </>
        )}
      </div>
      {/* pista */}
      <div
        ref={setTrack}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="relative h-10 overflow-hidden rounded-control bg-surface-2 ring-1 ring-inset ring-line"
        style={{ touchAction: "none" }}
      >
        {/* franjas del día */}
        {BANDS.map((b, i) => (
          <div key={i} className={`absolute inset-y-0 ${b.cls}`} style={{ left: `${pct(b.from)}%`, width: `${pct(b.to) - pct(b.from)}%` }} />
        ))}
        {/* línea "ahora" */}
        {nowVisible && (
          <div className="absolute inset-y-0 z-10 w-px bg-success" style={{ left: `${pct(nowMin)}%` }}>
            <span className="absolute -top-px left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-success" />
          </div>
        )}
        {/* bloque arrastrable + handles */}
        {valid && (
          <div data-h="move" className="bg-accent absolute inset-y-1.5 z-20 cursor-grab rounded-lg shadow-md active:cursor-grabbing" style={{ left: `${left}%`, width: `${width}%`, minWidth: "2.1rem" }}>
            <span data-h="start" className="absolute -left-1.5 top-1/2 flex h-7 w-3.5 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-surface shadow-md">
              <span className="h-3.5 w-0.5 rounded-full bg-accent/60" />
            </span>
            <span data-h="end" className="absolute -right-1.5 top-1/2 flex h-7 w-3.5 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-surface shadow-md">
              <span className="h-3.5 w-0.5 rounded-full bg-accent/60" />
            </span>
          </div>
        )}
      </div>
      {/* ticks de hora */}
      <div className="relative mt-1 h-3 text-caption tabular text-muted">
        {TICKS.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pct(t)}%` }}>{labelHour(t)}</span>
        ))}
      </div>
      <p className="mt-1.5 text-center text-caption text-muted">Arrastra los extremos o desliza el bloque</p>
    </div>
  );
}
