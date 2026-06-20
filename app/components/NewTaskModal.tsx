"use client";

import { useState } from "react";
import { Loader2, Play, Check } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { Modal, Field, inputCls } from "@/components/Modal";

export function NewTaskModal({
  open,
  onClose,
  initialName = "",
}: {
  open: boolean;
  onClose: () => void;
  initialName?: string;
}) {
  const { currentUserId, switchTo } = useApp();
  const { clients, projects, members, reload } = useData();

  const [name, setName] = useState(initialName);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [auxIds, setAuxIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const projectsForClient = clientId
    ? projects.filter((p) => p.clientId === clientId)
    : projects;

  const create = async (startNow: boolean) => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          responsableId: currentUserId,
          auxiliarIds: auxIds,
          clientId: clientId || undefined,
          projectId: projectId || undefined,
        }),
      });
      const d = await res.json();
      await reload();
      if (startNow && d.ok && d.id) switchTo(d.id);
      // reset
      setName(""); setClientId(""); setProjectId(""); setAuxIds([]);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const toggleAux = (id: string) =>
    setAuxIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva tarea"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={() => create(false)} disabled={!name.trim() || saving} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:border-zinc-300 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Crear
          </button>
          <button onClick={() => create(true)} disabled={!name.trim() || saving} className="inline-flex items-center gap-2 rounded-full bg-curva-purple px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} fill="currentColor" />} Crear y empezar
          </button>
        </div>
      }
    >
      <Field label="¿Qué vas a hacer?">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Benchmark de competidores" className={inputCls} />
      </Field>
      <div className="grid gap-0 sm:grid-cols-2 sm:gap-4">
        <Field label="Cliente">
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(""); }} className={inputCls}>
            <option value="">— Sin cliente —</option>
            {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
        <Field label="Proyecto (opcional)">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
            <option value="">— Sin proyecto —</option>
            {projectsForClient.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </Field>
      </div>
      <Field label="Apoyo (auxiliares)">
        <div className="flex flex-wrap gap-1.5">
          {members.filter((m) => m.id !== currentUserId && m.name && m.name !== "—").map((m) => (
            <button key={m.id} onClick={() => toggleAux(m.id)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${auxIds.includes(m.id) ? "bg-ink text-white" : "border border-line text-zinc-600 hover:border-zinc-300"}`}>
              {m.name}
            </button>
          ))}
        </div>
      </Field>
      <p className="text-xs text-zinc-400">Se crea en tu Notion (Tasks Tracker) asignada a ti.</p>
    </Modal>
  );
}
