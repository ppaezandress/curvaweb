"use client";

import { useState } from "react";
import { Hash, Check } from "lucide-react";
import { Modal, Field, inputCls } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/Avatar";
import type { Member } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

// Crear un canal propio (nombre + miembros). El creador se agrega solo.
export function CreateChannelModal({
  open, onClose, members, onCreate,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[]; // miembros del equipo con cuenta (notion_user_id → profile)
  onCreate: (name: string, memberProfileIds: string[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await onCreate(name.trim(), [...picked]); onClose(); setName(""); setPicked(new Set()); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo canal"
      footer={<div className="flex justify-end"><Button onClick={submit} disabled={!name.trim() || busy}>{busy ? "Creando…" : "Crear canal"}</Button></div>}>
      <Field label="Nombre del canal">
        <div className="relative">
          <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={name} onChange={(e) => setName(e.target.value.replace(/\s+/g, "-").toLowerCase())} placeholder="diseño" className={cn(inputCls, "pl-9")} autoFocus />
        </div>
      </Field>
      <Field label="Invitar a…">
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {members.map((m) => {
            const on = picked.has(m.id);
            return (
              <button key={m.id} onClick={() => toggle(m.id)} className={cn("flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition focus-ring", on ? "border-accent bg-accent/5" : "border-line hover:border-zinc-300")}>
                <Avatar member={m} size={32} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-fg">{m.name}</span></span>
                {on && <Check size={16} className="text-accent" />}
              </button>
            );
          })}
          {members.length === 0 && <p className="py-4 text-center text-sm text-muted">Aún no hay compañeros con cuenta. Pueden unirse después.</p>}
        </div>
      </Field>
    </Modal>
  );
}
