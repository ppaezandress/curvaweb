"use client";

import { useState } from "react";
import { Check, Trash2, UserPlus, EyeOff, Eye, Palette, Sparkles, Grid3x3, Image as ImageIcon, Ban, Upload, Loader2 } from "lucide-react";
import { Modal, Field, inputCls } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import {
  SOLID_COLORS, GRADIENTS, PATTERNS, DEFAULT_PATTERN_COLOR,
  backgroundStyle, type ChatBackground,
} from "@/lib/chat-backgrounds";

type Person = { id: string; name: string; avatar_url: string | null };
type BgTab = "none" | "color" | "gradient" | "pattern" | "image";

// Ajustes de un canal (solo creador o admin): renombrar, fondo del espacio,
// ocultar/archivar, y agregar/quitar miembros. El canal "team" es global:
// se renombra y también puede tener fondo.
export function ChannelSettingsModal({
  open, onClose, channel, currentMembers, candidates,
  onRename, onToggleHidden, onAddMember, onRemoveMember,
  background, onSaveBackground, onUploadImage,
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
  background?: ChatBackground | null;
  onSaveBackground?: (bg: ChatBackground) => Promise<void> | void;
  onUploadImage?: (file: File) => Promise<string | null>;
}) {
  const [name, setName] = useState(channel?.name || "");
  const [saving, setSaving] = useState(false);
  const [bg, setBg] = useState<ChatBackground>(background ?? { kind: "none" });
  const [bgTab, setBgTab] = useState<BgTab>((background?.kind as BgTab) || "color");
  const [patternColor, setPatternColor] = useState(
    background?.kind === "pattern" ? background.color : DEFAULT_PATTERN_COLOR,
  );
  const [uploading, setUploading] = useState(false);
  // El estado se inicializa de props; el padre remonta con key={channel.id}
  // al cambiar de canal, así que no hace falta un efecto de sincronización.

  if (!channel) return null;
  const isTeam = channel.kind === "team";

  const save = async () => {
    const clean = name.trim();
    if (!clean || clean === channel.name || saving) return;
    setSaving(true);
    try { await onRename(clean); } finally { setSaving(false); }
  };

  const applyBg = async (next: ChatBackground) => {
    setBg(next);
    await onSaveBackground?.(next);
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onUploadImage) return;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      if (url) await applyBg({ kind: "image", url });
    } finally { setUploading(false); }
  };

  const tabs: { id: BgTab; label: string; Icon: typeof Palette }[] = [
    { id: "none", label: "Ninguno", Icon: Ban },
    { id: "color", label: "Color", Icon: Palette },
    { id: "gradient", label: "Gradiente", Icon: Sparkles },
    { id: "pattern", label: "Patrón", Icon: Grid3x3 },
    { id: "image", label: "Imagen", Icon: ImageIcon },
  ];

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

      {/* ── Fondo del canal (aplica a todos, incluido Equipo) ───────────── */}
      <Field label="Fondo del canal">
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => (id === "none" ? applyBg({ kind: "none" }) : setBgTab(id))}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-ring ${
                (id === "none" ? bg.kind === "none" : bgTab === id && bg.kind !== "none")
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {bg.kind !== "none" && bgTab === "color" && (
          <div className="flex flex-wrap items-center gap-2">
            {SOLID_COLORS.map((c) => (
              <button key={c} onClick={() => applyBg({ kind: "color", value: c })} aria-label={c}
                className={`h-8 w-8 rounded-lg border transition ${bg.kind === "color" && bg.value === c ? "border-accent ring-2 ring-accent/40" : "border-line hover:scale-110"}`}
                style={{ background: c }} />
            ))}
            <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line text-muted transition hover:border-accent hover:text-accent" title="Color libre">
              <Palette size={14} />
              <input type="color" className="sr-only" onChange={(e) => applyBg({ kind: "color", value: e.target.value })} />
            </label>
          </div>
        )}

        {bg.kind !== "none" && bgTab === "gradient" && (
          <div className="grid grid-cols-3 gap-2">
            {GRADIENTS.map((g) => (
              <button key={g.id} onClick={() => applyBg({ kind: "gradient", value: g.id })}
                className={`relative h-12 overflow-hidden rounded-lg border text-caption font-semibold text-white/90 transition ${bg.kind === "gradient" && bg.value === g.id ? "border-accent ring-2 ring-accent/40" : "border-line hover:scale-[1.03]"}`}
                style={{ background: g.css }}>
                <span className="absolute inset-x-0 bottom-0 bg-black/20 px-1 py-0.5 text-left">{g.label}</span>
              </button>
            ))}
          </div>
        )}

        {bg.kind !== "none" && bgTab === "pattern" && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-4 gap-2">
              {PATTERNS.map((p) => (
                <button key={p.id} onClick={() => applyBg({ kind: "pattern", value: p.id, color: patternColor })}
                  className={`relative h-12 overflow-hidden rounded-lg border bg-surface-2 transition ${bg.kind === "pattern" && bg.value === p.id ? "border-accent ring-2 ring-accent/40" : "border-line hover:scale-[1.03]"}`}
                  title={p.label}>
                  <span className="absolute inset-0" style={backgroundStyle({ kind: "pattern", value: p.id, color: patternColor })} />
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              Color del patrón
              <input type="color" value={patternColor}
                onChange={(e) => { setPatternColor(e.target.value); if (bg.kind === "pattern") applyBg({ kind: "pattern", value: bg.value, color: e.target.value }); }}
                className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent" />
            </label>
          </div>
        )}

        {bg.kind !== "none" && bgTab === "image" && (
          <div className="flex items-center gap-3">
            {bg.kind === "image" && (
              <span className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-cover bg-center" style={{ backgroundImage: `url(${bg.url})` }} />
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-line px-3 py-2 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent">
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? "Subiendo…" : bg.kind === "image" ? "Cambiar imagen" : "Subir imagen"}
              <input type="file" accept="image/*" className="sr-only" onChange={onPickImage} disabled={uploading} />
            </label>
          </div>
        )}

        <p className="mt-2 text-caption text-muted">Lo ve todo el equipo. Las burbujas y el texto se mantienen legibles con un velo automático.</p>
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
