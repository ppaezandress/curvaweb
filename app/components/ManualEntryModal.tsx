"use client";

import { useMemo, useState } from "react";
import { Loader2, Check, Clock } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { Modal, Field, inputCls } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";

const AREAS = ["Trabajo enfocado", "Llamada", "Visita física", "Reunión", "Investigación", "Otro"];
const DUR_PRESETS = [15, 30, 45, 60, 90, 120];

export function ManualEntryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUserId } = useApp();
  const { tasks, clients, members, memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [area, setArea] = useState("Trabajo enfocado");
  const [clientId, setClientId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [minutes, setMinutes] = useState(60);
  // asistentes seleccionados; null = duración completa, número = "se fue antes"
  const [attendees, setAttendees] = useState<Record<string, number | null>>(
    () => (me ? { [me.name]: null } : {}),
  );
  const [earlyFor, setEarlyFor] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const taskMatches = useMemo(() => {
    if (!taskQuery.trim()) return [];
    const base = clientId ? tasks.filter((t) => t.clientId === clientId) : tasks;
    return base.filter((t) => t.name.toLowerCase().includes(taskQuery.toLowerCase())).slice(0, 6);
  }, [taskQuery, tasks, clientId]);

  const selectedTask = taskId ? tasks.find((t) => t.id === taskId) : undefined;

  const toggleAttendee = (name: string) =>
    setAttendees((prev) => {
      const next = { ...prev };
      if (name in next) { delete next[name]; }
      else next[name] = null;
      return next;
    });

  const save = async () => {
    if (saving || minutes <= 0) return;
    const list = Object.keys(attendees).map((name) => ({
      name,
      minutes: earlyFor.has(name) && attendees[name] ? (attendees[name] as number) : minutes,
    }));
    if (list.length === 0) return;
    setSaving(true);
    try {
      const startedAt = new Date(`${date}T10:00:00`).getTime();
      await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: taskId || undefined,
          clientId: clientId || undefined,
          taskName: taskId ? undefined : area,
          area,
          startedAt,
          endedAt: startedAt + minutes * 60000,
          attendees: list,
        }),
      });
      onClose();
      setMinutes(60); setTaskId(""); setTaskQuery("");
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
          <span className="text-xs text-zinc-400">{Object.keys(attendees).length} persona(s) · {minutes} min</span>
          <button onClick={save} disabled={saving || minutes <= 0} className="inline-flex items-center gap-2 rounded-full bg-curva-purple px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Guardar
          </button>
        </div>
      }
    >
      {/* Área — chips */}
      <Field label="¿Qué tipo de actividad?">
        <div className="flex flex-wrap gap-1.5">
          {AREAS.map((a) => (
            <button key={a} onClick={() => setArea(a)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${area === a ? "bg-ink text-white" : "border border-line text-zinc-600 hover:border-zinc-300"}`}>{a}</button>
          ))}
        </div>
      </Field>

      {/* Duración — chips rápidos */}
      <Field label="Duración">
        <div className="flex flex-wrap items-center gap-1.5">
          {DUR_PRESETS.map((m) => (
            <button key={m} onClick={() => setMinutes(m)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${minutes === m ? "bg-curva-purple text-white" : "border border-line text-zinc-600 hover:border-zinc-300"}`}>
              {m < 60 ? `${m}m` : `${m / 60}h${m % 60 ? " " + (m % 60) + "m" : ""}`}
            </button>
          ))}
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-xs">
            <Clock size={12} className="text-zinc-400" />
            <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-12 bg-transparent text-right tabular outline-none" />
            <span className="text-zinc-400">min</span>
          </span>
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
              <button key={m.id} onClick={() => toggleAttendee(m.name)} className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-medium transition ${on ? "bg-curva-purple/10 text-curva-purple ring-1 ring-curva-purple/40" : "border border-line text-zinc-600 hover:border-zinc-300"}`}>
                <Avatar member={m} size={20} /> {m.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
        {/* "se fue antes" por asistente seleccionado */}
        {Object.keys(attendees).length > 0 && (
          <div className="mt-2 space-y-1">
            {Object.keys(attendees).map((name) => {
              const early = earlyFor.has(name);
              return (
                <div key={name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-500">{name}</span>
                  {early ? (
                    <span className="inline-flex items-center gap-1">
                      <input type="number" min={1} max={minutes} value={attendees[name] ?? minutes} onChange={(e) => setAttendees((p) => ({ ...p, [name]: Number(e.target.value) }))} className="w-16 rounded-lg border border-line px-2 py-0.5 text-right tabular outline-none focus:border-curva-purple" />
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
