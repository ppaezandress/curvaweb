"use client";

import { useState } from "react";
import { ListTodo, SmilePlus } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { hhmmFromISO } from "@/lib/format";
import { parseMessage, notionTaskUrl } from "@/lib/notion-url";
import { cn } from "@/lib/cn";

export type ChatMsg = { id: number; user_id: string | null; body: string; kind: string; created_at: string };
export type ChatProfile = { id: string; name: string; avatar_url: string | null };
export type ReactionAgg = { emoji: string; count: number; mine: boolean };

const EMOJIS = ["👍", "❤️", "🎉", "🔥", "😂", "👀"];

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
    return <div className="py-1 text-center text-xs text-curva-purple">🎵 {msg.body}</div>;
  }

  const parts = parseMessage(msg.body);

  return (
    <div className={cn("group flex gap-2.5", mine && "flex-row-reverse")}>
      <div className="mt-0.5"><Avatar name={prof?.name || "?"} src={prof?.avatar_url} size={32} /></div>
      <div className={cn("max-w-[78%]", mine && "text-right")}>
        <p className="text-xs text-zinc-400">{prof?.name || "—"} · {hhmmFromISO(msg.created_at)}</p>
        <div className={cn("mt-0.5 inline-block rounded-2xl px-3.5 py-2 text-left text-sm", mine ? "bg-curva-purple text-white" : "bg-white text-ink shadow-soft")}>
          {parts.map((p, i) =>
            p.type === "text" ? (
              <span key={i} className="whitespace-pre-wrap">{p.text}</span>
            ) : (
              <a
                key={i}
                href={notionTaskUrl(p.id)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 align-middle text-xs font-medium transition",
                  mine ? "bg-white/20 hover:bg-white/30" : "bg-curva-purple/10 text-curva-purple hover:bg-curva-purple/20",
                )}
                title="Abrir en Notion"
              >
                <ListTodo size={11} /> {p.name}
              </a>
            ),
          )}
        </div>

        {/* Reacciones */}
        <div className={cn("mt-1 flex items-center gap-1", mine && "justify-end")}>
          {reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => onToggleReaction(msg.id, r.emoji)}
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition focus-ring",
                r.mine ? "border-curva-purple bg-curva-purple/10 text-curva-purple" : "border-line bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              {r.emoji} {r.count}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className="rounded-full p-1 text-zinc-300 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-500 focus-ring group-hover:opacity-100"
              aria-label="Reaccionar"
            >
              <SmilePlus size={14} />
            </button>
            {pickerOpen && (
              <div className={cn("absolute z-10 mt-1 flex gap-0.5 rounded-full border border-line bg-white p-1 shadow-float", mine ? "right-0" : "left-0")}>
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => { onToggleReaction(msg.id, e); setPickerOpen(false); }} className="rounded-full px-1.5 py-0.5 text-base transition hover:bg-zinc-100">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
