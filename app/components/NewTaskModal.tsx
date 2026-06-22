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
  const [internal, setInternal] = useState(false);
  const [weight, setWeight] = useState<"" | "Ligera" | "Media" | "Pesada">("");
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
          clientId: internal ? undefined : clientId || undefined,
          projectId: internal ? undefined : projectId || undefined,
          weight: weight || undefined,
          internal,
        }),
      });
      const d = await res.json();
      await reload();
      if (startNow && d.ok && d.id) switchTo(d.id);
      // reset
      setName(""); setClientId(""); setProjectId(""); setAuxIds([]); setInternal(false); setWeight("");
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
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && !saving) { e.preventDefault(); create(true); }
          }}
          placeholder="Ej. Benchmark de competidores"
          className={inputCls}
        />
      </Field>
      {/* ¿Trabajo interno? (sin cliente) */}
      <Field label="¿Para quién es?">
        <div className="flex gap-1.5">
          <button onClick={() => setInternal(false)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${!internal ? "border-curva-purple bg-curva-purple/5 text-curva-purple" : "border-line text-zinc-500 hover:border-zinc-300"}`}>
            Para un cliente
          </button>
          <button onClick={() => { setInternal(true); setClientId(""); setProjectId(""); }} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${internal ? "border-curva-teal bg-curva-teal/5 text-curva-teal" : "border-line text-zinc-500 hover:border-zinc-300"}`}>
            Interno (CURVA)
          </button>
        </div>
      </Field>

      {!internal && (
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
      )}

      {/* Peso / carga mental — para que la app pueda recomendar qué hacer */}
      <Field label="¿Qué tan pesada es?">
        <div className="flex gap-1.5">
          {(["Ligera", "Media", "Pesada"] as const).map((w) => (
            <button key={w} onClick={() => setWeight(weight === w ? "" : w)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${weight === w ? "border-curva-purple bg-curva-purple text-white" : "border-line text-zinc-600 hover:border-zinc-300"}`}>
              {w}
            </button>
          ))}
        </div>
      </Field>
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
