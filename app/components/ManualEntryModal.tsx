"use client";

import { useMemo, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { Modal, Field, inputCls } from "@/components/Modal";

const AREAS = ["Llamada", "Visita física", "Reunión", "Trabajo enfocado", "Investigación", "Otro"];

export function ManualEntryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUserId } = useApp();
  const { tasks, clients, members, memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [area, setArea] = useState("Llamada");
  const [clientId, setClientId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [minutes, setMinutes] = useState(60);
  // asistentes: nombre → minutos (default = minutes general)
  const [attendees, setAttendees] = useState<Record<string, number | null>>(
    () => (me ? { [me.name]: null } : {}),
  );
  const [saving, setSaving] = useState(false);

  // Tareas filtradas por cliente (si hay)
  const taskOptions = useMemo(() => {
    if (!clientId) return tasks.slice(0, 0); // exige cliente primero para no listar 300
    return tasks.filter((t) => t.clientId === clientId);
  }, [tasks, clientId]);

  const toggleAttendee = (name: string) =>
    setAttendees((prev) => {
      const next = { ...prev };
      if (name in next) delete next[name];
      else next[name] = null; // null = usa minutos generales
      return next;
    });

  const setAttendeeMin = (name: string, v: string) =>
    setAttendees((prev) => ({ ...prev, [name]: v === "" ? null : Number(v) }));

  const save = async () => {
    if (saving || minutes <= 0) return;
    const list = Object.entries(attendees).map(([name, m]) => ({
      name,
      minutes: m == null ? minutes : m,
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
      // reset mínimos
      setMinutes(60);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar tiempo manual"
      footer={
        <div className="flex justify-end">
          <button onClick={save} disabled={saving || minutes <= 0} className="inline-flex items-center gap-2 rounded-full bg-curva-purple px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Guardar
          </button>
        </div>
      }
    >
      <Field label="Tipo de actividad">
        <div className="flex flex-wrap gap-1.5">
          {AREAS.map((a) => (
            <button key={a} onClick={() => setArea(a)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${area === a ? "bg-ink text-white" : "border border-line text-zinc-600 hover:border-zinc-300"}`}>
              {a}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-0 sm:grid-cols-2 sm:gap-4">
        <Field label="Cliente">
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setTaskId(""); }} className={inputCls}>
            <option value="">— Sin cliente —</option>
            {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
        <Field label="Tarea (opcional)">
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={inputCls} disabled={!clientId}>
            <option value="">{clientId ? "— Solo cliente —" : "Elige cliente primero"}</option>
            {taskOptions.map((t) => (<option key={t.id} value={t.id}>{t.name.slice(0, 60)}</option>))}
          </select>
        </Field>
      </div>

      <div className="grid gap-0 sm:grid-cols-2 sm:gap-4">
        <Field label="Fecha">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Duración (minutos)">
          <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={inputCls} />
        </Field>
      </div>

      <Field label="Asistentes">
        <p className="mb-2 -mt-1 text-xs text-zinc-400">Marca quién participó. Si alguien se fue antes, ajusta sus minutos.</p>
        <div className="space-y-1.5">
          {members.filter((m) => m.name && m.name !== "—").map((m) => {
            const on = m.name in attendees;
            return (
              <div key={m.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${on ? "border-curva-purple/40 bg-curva-purple/5" : "border-line"}`}>
                <button onClick={() => toggleAttendee(m.name)} className={`flex h-5 w-5 items-center justify-center rounded-md border ${on ? "border-curva-purple bg-curva-purple text-white" : "border-zinc-300"}`}>
                  {on && <Check size={13} />}
                </button>
                <span className="flex-1 truncate text-sm text-ink">{m.name}</span>
                {on && (
                  <input
                    type="number"
                    min={1}
                    placeholder={String(minutes)}
                    value={attendees[m.name] ?? ""}
                    onChange={(e) => setAttendeeMin(m.name, e.target.value)}
                    className="w-20 rounded-lg border border-line px-2 py-1 text-right text-sm tabular outline-none focus:border-curva-purple"
                    title="Minutos (vacío = duración completa)"
                  />
                )}
              </div>
            );
          })}
        </div>
      </Field>
      <p className="text-xs text-zinc-400">Crea un registro por asistente en tu Notion (Registro de Tiempo).</p>
    </Modal>
  );
}
