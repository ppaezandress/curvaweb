"use client";

import { useState } from "react";
import { ListTodo, SmilePlus, AtSign } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { hhmmFromISO } from "@/lib/format";
import { parseMessage, notionTaskUrl } from "@/lib/notion-url";
import { cn } from "@/lib/cn";

export type ChatMsg = { id: number; user_id: string | null; body: string; kind: string; created_at: string; attachment_url?: string | null; attachment_type?: string | null };
export type ChatProfile = { id: string; name: string; avatar_url: string | null };
export type ReactionAgg = { emoji: string; count: number; mine: boolean };

const EMOJIS = ["👍", "❤️", "🎉", "🔥", "😂", "👀", "🙌", "💯", "🚀", "🤝", "🙏", "✅", "💪", "⚡", "😮", "🫶"];

export function MessageItem({
  msg, prof, mine, reactions, onToggleReaction,
}: {
  msg: ChatMsg;
  prof?: ChatProfile;
  mine: boolean;
  reactions: ReactionAgg[];
  onToggleReaction: (messageId: number, emoji: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (msg.kind === "system") {
    return <div className="py-1 text-center text-xs text-accent">🎵 {msg.body}</div>;
  }

  const parts = parseMessage(msg.body);

  return (
    <div className={cn("group flex gap-2.5", mine && "flex-row-reverse")}>
      <div className="mt-0.5"><Avatar name={prof?.name || "?"} src={prof?.avatar_url} size={32} /></div>
      <div className={cn("max-w-[78%]", mine && "text-right")}>
        <p className="text-xs text-muted">{prof?.name || "—"} · {hhmmFromISO(msg.created_at)}</p>

        {/* Adjunto: imagen / video / audio */}
        {msg.attachment_url && (
          <div className={cn("mt-1 inline-block overflow-hidden", mine && "text-right")}>
            {msg.attachment_type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                <img src={msg.attachment_url} alt="adjunto" className="max-h-72 max-w-[min(78vw,20rem)] rounded-card border border-line object-cover" />
              </a>
            ) : msg.attachment_type === "video" ? (
              <video src={msg.attachment_url} controls className="max-h-72 max-w-[min(78vw,20rem)] rounded-card border border-line" />
            ) : (
              <audio src={msg.attachment_url} controls className="w-64 max-w-[78vw]" />
            )}
          </div>
        )}

        {msg.body.trim() && (
        <div className={cn("mt-0.5 inline-block rounded-card px-3.5 py-2 text-left text-sm", mine ? "bg-accent text-white" : "bg-surface text-fg shadow-soft")}>
          {parts.map((p, i) =>
            p.type === "text" ? (
              <span key={i} className="whitespace-pre-wrap">{p.text}</span>
            ) : p.type === "user" ? (
              <span
                key={i}
                className={cn(
                  "mx-0.5 inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 align-middle text-xs font-semibold",
                  mine ? "bg-surface/20" : "bg-accent/10 text-accent",
                )}
              >
                <AtSign size={10} />{p.name}
              </span>
            ) : (
              <a
                key={i}
                href={notionTaskUrl(p.id)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 align-middle text-xs font-medium transition",
                  mine ? "bg-surface/20 hover:bg-surface/30" : "bg-accent/10 text-accent hover:bg-accent/20",
                )}
                title="Abrir en Notion"
              >
                <ListTodo size={11} /> {p.name}
              </a>
            ),
          )}
        </div>
        )}

        {/* Reacciones */}
        <div className={cn("mt-1 flex items-center gap-1", mine && "justify-end")}>
          {reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => onToggleReaction(msg.id, r.emoji)}
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition focus-ring",
                r.mine ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-muted hover:border-muted/40",
              )}
            >
              {r.emoji} {r.count}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className="rounded-full p-1 text-muted/70 opacity-100 transition hover:bg-surface-2 hover:text-fg focus-ring focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="Reaccionar"
            >
              <SmilePlus size={14} />
            </button>
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className={cn("absolute z-20 mt-1 grid w-[13.5rem] grid-cols-8 gap-0.5 rounded-card border border-line bg-surface p-1.5 shadow-float", mine ? "right-0" : "left-0")}>
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => { onToggleReaction(msg.id, e); setPickerOpen(false); }} className="rounded-lg py-1 text-base transition hover:bg-surface-2 focus-ring">
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
