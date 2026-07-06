"use client";

import { useState } from "react";
import { Check, Trash2, UserPlus, EyeOff, Eye } from "lucide-react";
import { Modal, Field, inputCls } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";

type Person = { id: string; name: string; avatar_url: string | null };

// Ajustes de un canal (solo creador o admin): renombrar, ocultar/archivar,
// y agregar/quitar miembros. El canal "team" es global: solo se renombra.
export function ChannelSettingsModal({
  open, onClose, channel, currentMembers, candidates,
  onRename, onToggleHidden, onAddMember, onRemoveMember,
}: {
  open: boolean;
  onClose: () => void;
  channel: { id: number; name: string; kind: string; is_hidden?: boolean } | null;
  currentMembers: Person[];
  candidates: Person[];
  onRename: (name: string) => Promise<void> | void;
  onToggleHidden: (hidden: boolean) => Promise<void> | void;
  onAddMember: (uid: string) => Promise<void> | void;
  onRemoveMember: (uid: string) => Promise<void> | void;
}) {
  const [name, setName] = useState(channel?.name || "");
  const [saving, setSaving] = useState(false);
  if (!channel) return null;
  const isTeam = channel.kind === "team";

  const save = async () => {
    const clean = name.trim();
    if (!clean || clean === channel.name || saving) return;
    setSaving(true);
    try { await onRename(clean); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Ajustes del canal">
      <Field label="Nombre del canal">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="nombre-del-canal" />
          <button onClick={save} disabled={saving || !name.trim() || name.trim() === channel.name} className="inline-flex shrink-0 items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
            <Check size={15} /> Guardar
          </button>
        </div>
      </Field>

      {!isTeam && (
        <>
          <Field label="Miembros">
            <div className="space-y-1.5">
              {currentMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-control border border-line px-2.5 py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={m.name} src={m.avatar_url} size={22} />
                    <span className="truncate text-sm text-fg">{m.name}</span>
                  </span>
                  <button onClick={() => onRemoveMember(m.id)} className="rounded-full p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger focus-ring" aria-label="Quitar" title="Quitar del canal">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {currentMembers.length === 0 && <p className="text-xs text-muted">Sin miembros aún.</p>}
            </div>
          </Field>

          {candidates.length > 0 && (
            <Field label="Agregar al canal">
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((c) => (
                  <button key={c.id} onClick={() => onAddMember(c.id)} className="inline-flex items-center gap-1.5 rounded-full border border-line py-1 pl-1 pr-3 text-xs font-medium text-muted transition hover:border-accent hover:text-accent focus-ring">
                    <Avatar name={c.name} src={c.avatar_url} size={20} /> <UserPlus size={11} /> {c.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <div className="mt-2 flex items-center justify-between rounded-card border border-line bg-surface-2/50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{channel.is_hidden ? "Canal oculto" : "Ocultar canal"}</p>
              <p className="text-xs text-muted">{channel.is_hidden ? "No aparece en la lista del equipo." : "Lo archiva: deja de aparecer en la lista."}</p>
            </div>
            <button onClick={() => onToggleHidden(!channel.is_hidden)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition focus-ring ${channel.is_hidden ? "bg-success/10 text-success hover:bg-success/20" : "bg-warn/10 text-warn hover:bg-warn/20"}`}>
              {channel.is_hidden ? <><Eye size={13} /> Mostrar</> : <><EyeOff size={13} /> Ocultar</>}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
