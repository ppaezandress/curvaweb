"use client";

import { useMemo, useState } from "react";
import {
  Loader2, Check, Clock, Minus, Plus, ArrowRight,
  Focus, Phone, MapPin, Users, Search, MoreHorizontal, type LucideIcon,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatDuration } from "@/lib/format";
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
  { from: 6 * 60, to: 12 * 60, cls: "bg-amber-50" },   // mañana
  { from: 12 * 60, to: 18 * 60, cls: "bg-sky-50" },    // tarde
  { from: 18 * 60, to: 24 * 60, cls: "bg-indigo-50" }, // noche
];
const TICKS = [6, 9, 12, 15, 18, 21, 24].map((h) => h * 60);

export function ManualEntryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUserId } = useApp();
  const { tasks, clients, members, memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [area, setArea] = useState("Trabajo enfocado");
  const [clientId, setClientId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
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

  // Ajuste rápido ±15 min (sin cruzar el otro extremo).
  const bump = (which: "start" | "end", delta: number) => {
    if (which === "start") setStartTime(fromMin(Math.max(0, Math.min(toMin(startTime) + delta, toMin(endTime)))));
    else setEndTime(fromMin(Math.min(24 * 60 - 1, Math.max(toMin(endTime) + delta, toMin(startTime)))));
  };
  const applyPreset = (m: number) => setEndTime(fromMin(Math.min(toMin(startTime) + m, 24 * 60 - 1)));
  const setEndNow = () => { const d = new Date(); d.setMinutes(Math.round(d.getMinutes() / 5) * 5, 0, 0); setEndTime(hhmm(d)); };
  // La timeline interactiva ajusta ambos extremos a la vez.
  const setRange = (s: number, e: number) => { setStartTime(fromMin(s)); setEndTime(fromMin(e)); };

  const taskMatches = useMemo(() => {
    if (!taskQuery.trim()) return [];
    const base = clientId ? tasks.filter((t) => t.clientId === clientId) : tasks;
    return base.filter((t) => t.name.toLowerCase().includes(taskQuery.toLowerCase())).slice(0, 6);
  }, [taskQuery, tasks, clientId]);

  const selectedTask = taskId ? tasks.find((t) => t.id === taskId) : undefined;
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
    setSaving(true);
    try {
      const startedAt = new Date(`${date}T${startTime}:00`).getTime();
      const endedAt = new Date(`${date}T${endTime}:00`).getTime();
      await fetch("/api/time-entries", {
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
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            <AreaIcon size={13} className="text-zinc-400" />
            <span className="truncate">{area}</span>
            <span className="text-zinc-300">·</span>
            <span className={valid ? "tabular font-semibold text-ink" : "text-rose-500"}>{valid ? formatDuration(minutes * 60) : "—"}</span>
            <span className="text-zinc-300">·</span>
            <span>{peopleCount} {peopleCount === 1 ? "persona" : "personas"}</span>
          </span>
          <button onClick={save} disabled={saving || !valid} className="inline-flex items-center gap-2 rounded-full bg-curva-purple px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-curva-purple/20 transition hover:opacity-90 active:scale-95 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Guardar
          </button>
        </div>
      }
    >
      {/* Tipo de actividad — chips con icono */}
      <Field label="¿Qué tipo de actividad?">
        <div className="flex flex-wrap gap-1.5">
          {AREAS.map(({ label, icon: Icon }) => {
            const on = area === label;
            return (
              <button key={label} onClick={() => setArea(label)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${on ? "bg-ink text-white shadow-sm" : "border border-line text-zinc-600 hover:border-zinc-300"}`}>
                <Icon size={13} className={on ? "text-white" : "text-zinc-400"} /> {label}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Horario — ¿de qué hora a qué hora? con mini-timeline visual */}
      <Field label="¿De qué hora a qué hora?">
        <div className="rounded-2xl border border-line bg-gradient-to-b from-zinc-50/80 to-white p-3.5 shadow-soft">
          <div className="flex items-end gap-2">
            <TimePart label="Inicio" value={startTime} onBump={(d) => bump("start", d)} onChange={setStartTime} />
            <ArrowRight size={18} className="mb-3 shrink-0 text-zinc-300" />
            <TimePart label="Fin" value={endTime} onBump={(d) => bump("end", d)} onChange={setEndTime} accent />
          </div>

          {/* Timeline interactiva: arrastra los extremos o el bloque entero */}
          <Timeline startMin={toMin(startTime)} endMin={toMin(endTime)} valid={valid} onChange={setRange} />

          {/* Duración derivada (con micro-pop) + "Terminó ahora" */}
          <div className="mt-3 flex items-center justify-between gap-2">
            {valid ? (
              <span key={minutes} className="modal-pop inline-flex items-center gap-1.5 rounded-full bg-curva-purple/10 px-3 py-1.5 text-sm font-bold text-curva-purple">
                <Clock size={14} /> {formatDuration(minutes * 60)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-500">
                El fin debe ser después del inicio
              </span>
            )}
            <button onClick={setEndNow} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-curva-purple hover:text-curva-purple active:scale-95">
              Terminó ahora
            </button>
          </div>

          {/* Atajos: fijan el fin = inicio + X */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-zinc-400">Duró:</span>
            {DUR_PRESETS.map((m) => {
              const on = valid && minutes === m;
              return (
                <button key={m} onClick={() => applyPreset(m)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 ${on ? "bg-curva-purple text-white" : "border border-line bg-white text-zinc-500 hover:border-curva-purple hover:text-curva-purple"}`}>
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
            <button onClick={() => { setTaskId(""); setTaskQuery(""); }} className="flex w-full items-center justify-between rounded-xl border border-curva-purple/40 bg-curva-purple/5 px-3 py-2.5 text-left text-sm">
              <span className="truncate text-ink">{selectedTask.name}</span>
              <span className="ml-2 shrink-0 text-xs text-curva-purple">cambiar</span>
            </button>
          ) : (
            <div className="relative">
              <input value={taskQuery} onChange={(e) => setTaskQuery(e.target.value)} placeholder="Buscar tarea…" className={inputCls} />
              {taskMatches.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-line bg-white shadow-float">
                  {taskMatches.map((t) => (
                    <button key={t.id} onClick={() => { setTaskId(t.id); setTaskQuery(""); }} className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-zinc-50">{t.name}</button>
                  ))}
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
              <button key={m.id} onClick={() => toggleAttendee(m.name)} className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-medium transition active:scale-95 ${on ? "bg-curva-purple/10 text-curva-purple ring-1 ring-curva-purple/40" : "border border-line text-zinc-600 hover:border-zinc-300"}`}>
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
                  <span className="text-zinc-500">{name}</span>
                  {early ? (
                    <span className="inline-flex items-center gap-1">
                      <input type="number" min={1} max={valid ? minutes : undefined} value={attendees[name] ?? (valid ? minutes : 0)} onChange={(e) => setAttendees((p) => ({ ...p, [name]: Number(e.target.value) }))} className="w-16 rounded-lg border border-line px-2 py-0.5 text-right tabular outline-none focus:border-curva-purple" />
                      <span className="text-zinc-400">min</span>
                      <button onClick={() => setEarlyFor((p) => { const n = new Set(p); n.delete(name); return n; })} className="text-zinc-400 hover:text-zinc-600">↺</button>
                    </span>
                  ) : (
                    <button onClick={() => setEarlyFor((p) => new Set(p).add(name))} className="text-zinc-400 underline-offset-2 hover:text-curva-purple hover:underline">se fue antes</button>
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
      <p className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <div className="flex items-center gap-1 rounded-xl border border-line bg-white p-1 transition focus-within:border-curva-purple/50">
        <button
          onClick={() => onBump(-15)}
          className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-ink active:scale-90 focus-ring"
          aria-label={`${label}: 15 minutos menos`}
        >
          <Minus size={16} />
        </button>
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Hora de ${label.toLowerCase()}`}
          className={`tabular w-full min-w-0 bg-transparent text-center font-display text-lg font-bold outline-none ${accent ? "text-curva-purple" : "text-ink"}`}
        />
        <button
          onClick={() => onBump(15)}
          className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-ink active:scale-90 focus-ring"
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
      {/* etiquetas de hora sobre los extremos */}
      <div className="relative mb-1 h-4 text-[10px] font-bold tabular">
        <span className="absolute -translate-x-1/2 whitespace-nowrap text-ink" style={{ left: `${left}%` }}>{labelHourMin(startMin)}</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap text-curva-purple" style={{ left: `${right}%` }}>{labelHourMin(endMin)}</span>
      </div>
      {/* pista */}
      <div
        ref={setTrack}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="relative h-10 overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-inset ring-line"
        style={{ touchAction: "none" }}
      >
        {/* franjas del día */}
        {BANDS.map((b, i) => (
          <div key={i} className={`absolute inset-y-0 ${b.cls}`} style={{ left: `${pct(b.from)}%`, width: `${pct(b.to) - pct(b.from)}%` }} />
        ))}
        {/* línea "ahora" */}
        {nowVisible && (
          <div className="absolute inset-y-0 z-10 w-px bg-curva-teal" style={{ left: `${pct(nowMin)}%` }}>
            <span className="absolute -top-px left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-curva-teal" />
          </div>
        )}
        {/* bloque arrastrable + handles */}
        {valid && (
          <div data-h="move" className="curva-gradient absolute inset-y-1.5 z-20 cursor-grab rounded-lg shadow-md active:cursor-grabbing" style={{ left: `${left}%`, width: `${width}%` }}>
            <span data-h="start" className="absolute -left-1.5 top-1/2 flex h-7 w-3.5 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-white shadow-md">
              <span className="h-3.5 w-0.5 rounded-full bg-curva-purple/60" />
            </span>
            <span data-h="end" className="absolute -right-1.5 top-1/2 flex h-7 w-3.5 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-white shadow-md">
              <span className="h-3.5 w-0.5 rounded-full bg-curva-purple/60" />
            </span>
          </div>
        )}
      </div>
      {/* ticks de hora */}
      <div className="relative mt-1 h-3 text-[10px] tabular text-zinc-400">
        {TICKS.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pct(t)}%` }}>{labelHour(t)}</span>
        ))}
      </div>
      <p className="mt-1.5 text-center text-[10px] text-zinc-400">Arrastra los extremos o desliza el bloque</p>
    </div>
  );
}
