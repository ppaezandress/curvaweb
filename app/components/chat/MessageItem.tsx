"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ListTodo, SmilePlus, AtSign, Reply, Pencil, Trash2, Pin, PinOff, Check, X, Bookmark } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { popover } from "@/lib/motion";
import { hhmmFromISO } from "@/lib/format";
import { parseMessage, notionTaskUrl } from "@/lib/notion-url";
import { VoiceBubble } from "@/components/chat/VoiceBubble";
import { VideoBubble } from "@/components/chat/VideoBubble";
import { EMOJI_LIST } from "@/lib/emojis";
import { cn } from "@/lib/cn";

export type ChatMsg = { id: number; user_id: string | null; body: string; kind: string; created_at: string; attachment_url?: string | null; attachment_type?: string | null; edited_at?: string | null; deleted_at?: string | null; parent_id?: number | null };
export type ChatProfile = { id: string; name: string; avatar_url: string | null; email?: string | null };
export type ReactionAgg = { emoji: string; count: number; mine: boolean };
export type RsvpAgg = { yes: number; no: number; maybe: number; mine: string | null };

// Un mensaje es "de junta" si arranca con el 📅 que pone EventModal → onCreated.
export function isMeetingMsg(body: string): boolean {
  return body.trimStart().startsWith("📅");
}

const RSVP_OPTS: { key: string; label: string; emoji: string }[] = [
  { key: "yes", label: "Voy", emoji: "✅" },
  { key: "no", label: "No voy", emoji: "❌" },
  { key: "maybe", label: "Tal vez", emoji: "🤔" },
];


// Formato inline estilo Slack/markdown: **negrita** _cursiva_ ~~tachado~~ `código`.
function renderRich(text: string): ReactNode[] {
  const rx = /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s]+)/g;
  const out: ReactNode[] = [];
  let last = 0, k = 0, m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("http")) out.push(<a key={k++} href={t} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 opacity-90 hover:opacity-100">{t}</a>);
    else if (t.startsWith("**") || t.startsWith("__")) out.push(<strong key={k++} className="font-semibold">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("~~")) out.push(<s key={k++}>{t.slice(2, -2)}</s>);
    else if (t.startsWith("`")) out.push(<code key={k++} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em]">{t.slice(1, -1)}</code>);
    else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Texto plano de un mensaje (para la cita de respuesta): sin tokens ni saltos.
function plain(body: string): string {
  return body.replace(/[@/]\[[^\]]+\]\([^)]+\)/g, (m) => m.replace(/^[@/]\[/, "").replace(/\]\([^)]+\)$/, "")).replace(/\s+/g, " ").trim();
}

// Editor inline (se monta al editar; su estado inicial es el cuerpo, sin efecto de sync).
function MessageEditor({ initial, onSave, onCancel }: { initial: string; onSave: (body: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);
  return (
    <div className="mt-0.5 w-[min(78vw,26rem)]">
      <textarea
        ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSave(draft); }
          if (e.key === "Escape") onCancel();
        }}
        className="w-full resize-none rounded-card border border-accent/50 bg-[var(--surface-solid)] px-3 py-2 text-left text-sm text-fg outline-none focus-ring"
      />
      <div className="mt-1 flex items-center gap-2 text-xs">
        <button onClick={() => onSave(draft)} className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 font-semibold text-white transition hover:opacity-90"><Check size={12} /> Guardar</button>
        <button onClick={onCancel} className="rounded-full px-2 py-1 font-medium text-muted transition hover:text-fg">Cancelar</button>
        <span className="hidden text-muted sm:inline">Esc cancela · Enter guarda</span>
      </div>
    </div>
  );
}

export function MessageItem({
  msg, prof, mine, reactions, onToggleReaction, onBg = false,
  grouped = false, pinned = false, saved = false, canModify = false, editing = false,
  parentMsg, parentProf, rsvp, onRsvp,
  onReply, onStartEdit, onCancelEdit, onSaveEdit, onDelete, onTogglePin, onToggleSave,
}: {
  msg: ChatMsg;
  prof?: ChatProfile;
  mine: boolean;
  reactions: ReactionAgg[];
  onToggleReaction: (messageId: number, emoji: string) => void;
  onBg?: boolean;
  rsvp?: RsvpAgg;
  onRsvp?: (messageId: number, response: string) => void;
  grouped?: boolean;
  pinned?: boolean;
  saved?: boolean;
  canModify?: boolean;
  editing?: boolean;
  parentMsg?: ChatMsg | null;
  parentProf?: ChatProfile;
  onReply?: (msg: ChatMsg) => void;
  onStartEdit?: (id: number) => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (id: number, body: string) => void;
  onDelete?: (id: number) => void;
  onTogglePin?: (msg: ChatMsg) => void;
  onToggleSave?: (msg: ChatMsg) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [emojiQ, setEmojiQ] = useState("");

  if (msg.kind === "system") {
    return <div className="py-1 text-center text-xs text-accent">🎵 {msg.body}</div>;
  }

  // Mensaje eliminado: rastro discreto, sin acciones.
  if (msg.deleted_at) {
    return (
      <div className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
        <div className="w-8 shrink-0" />
        <p className="mt-0.5 text-xs italic text-muted">Mensaje eliminado</p>
      </div>
    );
  }

  const parts = parseMessage(msg.body);
  const nameHalo = onBg ? { color: "var(--fg)", textShadow: "0 0 3px var(--background), 0 0 6px var(--background), 0 1px 2px var(--background)" } : undefined;

  return (
    <div className={cn("group relative flex gap-2.5", mine && "flex-row-reverse", grouped ? "mt-0.5" : "mt-1.5")}>
      {grouped
        ? <div className="w-8 shrink-0 text-center text-[10px] leading-8 text-transparent transition group-hover:text-muted" style={nameHalo}>{hhmmFromISO(msg.created_at)}</div>
        : <div className="mt-0.5"><Avatar name={prof?.name || "?"} src={prof?.avatar_url} size={32} /></div>}

      <div className={cn("relative max-w-[78%]", mine && "text-right")}>
        {!grouped && (
          <p className={cn("mb-0.5 text-xs", mine && "text-right")}>
            <span className={cn("inline-block font-medium", !onBg && "text-muted")} style={nameHalo}>
              {prof?.name || "—"} · {hhmmFromISO(msg.created_at)}
            </span>
            {pinned && <Pin size={11} className="ml-1 inline text-accent" fill="currentColor" />}
          </p>
        )}

        {/* Cita del mensaje al que se responde */}
        {parentMsg && (
          <div className={cn("mb-1 inline-flex max-w-full items-center gap-1.5 rounded-lg border-l-2 border-accent/50 bg-surface-2/60 px-2 py-1 text-left text-xs", mine && "flex-row-reverse text-right")}>
            <Reply size={11} className="shrink-0 text-accent" />
            <span className="min-w-0 truncate text-muted"><b className="text-fg/80">{parentProf?.name?.split(" ")[0] || "—"}:</b> {parentMsg.deleted_at ? "mensaje eliminado" : (plain(parentMsg.body) || "adjunto")}</span>
          </div>
        )}

        {/* Adjunto */}
        {msg.attachment_url && !editing && (
          <div className={cn("mt-0.5 inline-block overflow-hidden", mine && "text-right")}>
            {msg.attachment_type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                <img src={msg.attachment_url} alt="adjunto" className="max-h-64 max-w-[min(68vw,16rem)] rounded-card border border-line object-cover" />
              </a>
            ) : msg.attachment_type === "video" ? (
              <VideoBubble src={msg.attachment_url} mine={mine} />
            ) : (
              <VoiceBubble src={msg.attachment_url} mine={mine} />
            )}
          </div>
        )}

        {/* Cuerpo: editor inline o burbuja */}
        {editing ? (
          <MessageEditor initial={msg.body} onSave={(b) => onSaveEdit?.(msg.id, b)} onCancel={() => onCancelEdit?.()} />
        ) : msg.body.trim() && (
          <div className={cn("mt-0.5 inline-block rounded-card px-3.5 py-2 text-left text-sm", mine ? "bg-accent text-white" : "bg-surface text-fg shadow-soft")}>
            {parts.map((p, i) =>
              p.type === "text" ? (
                <span key={i} className="whitespace-pre-wrap">{renderRich(p.text)}</span>
              ) : p.type === "user" ? (
                <span key={i} className={cn("mx-0.5 inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 align-middle text-xs font-semibold", mine ? "bg-surface/20" : "bg-accent/10 text-accent")}>
                  <AtSign size={10} />{p.name}
                </span>
              ) : (
                <a key={i} href={notionTaskUrl(p.id)} target="_blank" rel="noopener noreferrer" className={cn("mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 align-middle text-xs font-medium transition", mine ? "bg-surface/20 hover:bg-surface/30" : "bg-accent/10 text-accent hover:bg-accent/20")} title="Abrir en Notion">
                  <ListTodo size={11} /> {p.name}
                </a>
              ),
            )}
            {msg.edited_at && <span className={cn("ml-1.5 align-middle text-[10px]", mine ? "text-white/60" : "text-muted")}>(editado)</span>}
          </div>
        )}

        {/* RSVP a una junta: responder Voy / No voy / Tal vez dentro del chat */}
        {!editing && isMeetingMsg(msg.body) && onRsvp && (
          <div className={cn("mt-1.5 flex flex-wrap items-center gap-1.5", mine && "justify-end")}>
            {RSVP_OPTS.map((o) => {
              const count = rsvp ? (rsvp[o.key as "yes" | "no" | "maybe"] as number) : 0;
              const active = rsvp?.mine === o.key;
              return (
                <button
                  key={o.key}
                  onClick={() => onRsvp(msg.id, o.key)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition focus-ring active:scale-95",
                    active ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-muted hover:border-muted/40 hover:text-fg",
                  )}
                >
                  <span aria-hidden>{o.emoji}</span> {o.label}
                  {count > 0 && <span className={cn("tabular-nums", active ? "text-accent" : "text-fg/70")}>{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Reacciones */}
        {!editing && (
        <div className={cn("mt-1 flex items-center gap-1", mine && "justify-end")}>
          {reactions.map((r) => (
            <button key={r.emoji} onClick={() => onToggleReaction(msg.id, r.emoji)} className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition focus-ring", r.mine ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-muted hover:border-muted/40")}>
              {r.emoji} {r.count}
            </button>
          ))}
        </div>
        )}

        {/* Toolbar de acciones (hover) — estilo Slack */}
        {!editing && (
          <div className={cn("absolute -top-3 z-10 hidden items-center gap-0.5 rounded-full border border-line bg-[var(--surface-solid)] px-1 py-0.5 shadow-float group-hover:flex", mine ? "left-0" : "right-0")}>
            <div className="relative">
              <button onClick={() => setPickerOpen((o) => !o)} className="rounded-full p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg focus-ring" aria-label="Reaccionar"><SmilePlus size={14} /></button>
              <AnimatePresence>
                {pickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                    <motion.div variants={popover} initial="hidden" animate="visible" exit="hidden" className={cn("absolute z-20 mt-1 w-64 rounded-card border border-line bg-[var(--surface-solid)] p-2 shadow-float", mine ? "left-0 origin-top-left" : "right-0 origin-top-right")}>
                      <input autoFocus value={emojiQ} onChange={(e) => setEmojiQ(e.target.value)} placeholder="Buscar emoji…" className="mb-1.5 w-full rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs text-fg outline-none focus-ring" />
                      <div className="grid max-h-40 grid-cols-8 gap-0.5 overflow-y-auto">
                        {EMOJI_LIST.filter((e) => !emojiQ.trim() || e.k.includes(emojiQ.toLowerCase()) || e.c === emojiQ).map((e) => (
                          <button key={e.c} onClick={() => { onToggleReaction(msg.id, e.c); setPickerOpen(false); setEmojiQ(""); }} className="rounded-lg py-1 text-base transition hover:bg-surface-2 focus-ring">{e.c}</button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => onReply?.(msg)} className="rounded-full p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg focus-ring" aria-label="Responder" title="Responder"><Reply size={14} /></button>
            <button onClick={() => onTogglePin?.(msg)} className={cn("rounded-full p-1.5 transition hover:bg-surface-2 focus-ring", pinned ? "text-accent" : "text-muted hover:text-fg")} aria-label={pinned ? "Quitar fijado" : "Fijar"} title={pinned ? "Quitar fijado" : "Fijar"}>
              {pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
            <button onClick={() => onToggleSave?.(msg)} className={cn("rounded-full p-1.5 transition hover:bg-surface-2 focus-ring", saved ? "text-accent" : "text-muted hover:text-fg")} aria-label={saved ? "Quitar de guardados" : "Guardar"} title={saved ? "Quitar de guardados" : "Guardar"}>
              <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
            </button>
            {canModify && (
              <>
                <button onClick={() => onStartEdit?.(msg.id)} className="rounded-full p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg focus-ring" aria-label="Editar" title="Editar"><Pencil size={14} /></button>
                {confirmDel ? (
                  <span className="flex items-center gap-0.5">
                    <button onClick={() => { onDelete?.(msg.id); setConfirmDel(false); }} className="rounded-full px-2 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10 focus-ring">Borrar</button>
                    <button onClick={() => setConfirmDel(false)} className="rounded-full p-1.5 text-muted transition hover:bg-surface-2 focus-ring" aria-label="Cancelar"><X size={13} /></button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDel(true)} className="rounded-full p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger focus-ring" aria-label="Borrar" title="Borrar"><Trash2 size={14} /></button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
