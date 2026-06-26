"use client";

import { useMemo, useRef, useState } from "react";
import { Send, ListTodo, AtSign, X } from "lucide-react";
import type { Task, Member } from "@/lib/mock-data";
import { taskToken, userToken } from "@/lib/notion-url";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/cn";

type Trigger = { kind: "user" | "task"; query: string } | null;

// Composer estilo Slack: "@" menciona personas, "/" menciona tareas (→ Notion).
export function Composer({ tasks, members, onSend }: { tasks: Task[]; members: Member[]; onSend: (body: string) => void }) {
  const [text, setText] = useState("");
  const [trigger, setTrigger] = useState<Trigger>(null);
  const [people, setPeople] = useState<Member[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (!trigger) return [] as (Member | Task)[];
    const q = trigger.query.toLowerCase();
    if (trigger.kind === "user") return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
    return tasks.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 6);
  }, [trigger, members, tasks]);

  const onChange = (v: string) => {
    setText(v);
    const at = v.match(/@([^@/\s][^@/]*|)$/); // "@..." al final
    const slash = v.match(/\/([^/@\s][^/@]*|)$/); // "/..." al final
    if (at) setTrigger({ kind: "user", query: at[1] });
    else if (slash) setTrigger({ kind: "task", query: slash[1] });
    else setTrigger(null);
  };

  const stripTrigger = () =>
    setText((v) => v.replace(/[@/]([^@/]*)$/, "").trimEnd());

  const pickPerson = (m: Member) => {
    stripTrigger(); setTrigger(null);
    setPeople((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
    inputRef.current?.focus();
  };
  const pickTask = (t: Task) => {
    stripTrigger(); setTrigger(null);
    setPendingTasks((p) => (p.some((x) => x.id === t.id) ? p : [...p, t]));
    inputRef.current?.focus();
  };

  const submit = () => {
    const tokens = [
      ...people.map((m) => userToken(m.id, m.name)),
      ...pendingTasks.map((t) => taskToken(t.id, t.name)),
    ].join(" ");
    const body = [text.trim(), tokens].filter(Boolean).join(" ");
    if (!body) return;
    onSend(body);
    setText(""); setPeople([]); setPendingTasks([]); setTrigger(null);
  };

  return (
    <div className="relative border-t border-line pt-3">
      {/* Dropdown de autocompletado */}
      {trigger && matches.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 max-h-64 w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface shadow-float">
          <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {trigger.kind === "user" ? "Mencionar persona" : "Mencionar tarea"}
          </p>
          {matches.map((it) =>
            trigger.kind === "user" ? (
              <button key={(it as Member).id} onClick={() => pickPerson(it as Member)} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-surface-2 focus-ring">
                <Avatar member={it as Member} size={24} />
                <span className="truncate text-sm text-fg">{(it as Member).name}</span>
              </button>
            ) : (
              <button key={(it as Task).id} onClick={() => pickTask(it as Task)} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-surface-2 focus-ring">
                <ListTodo size={14} className="shrink-0 text-accent" />
                <span className="truncate text-sm text-fg">{(it as Task).name}</span>
              </button>
            ),
          )}
        </div>
      )}

      {/* Chips de menciones pendientes */}
      {(people.length > 0 || pendingTasks.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {people.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-curva-indigo/10 py-0.5 pl-2 pr-1 text-xs font-medium text-curva-indigo">
              <AtSign size={11} /> <span className="max-w-[140px] truncate">{m.name}</span>
              <button onClick={() => setPeople((p) => p.filter((x) => x.id !== m.id))} className="rounded-full p-0.5 hover:bg-curva-indigo/20 focus-ring" aria-label="Quitar"><X size={11} /></button>
            </span>
          ))}
          {pendingTasks.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-accent/10 py-0.5 pl-2 pr-1 text-xs font-medium text-accent">
              <ListTodo size={11} /> <span className="max-w-[140px] truncate">{t.name}</span>
              <button onClick={() => setPendingTasks((p) => p.filter((x) => x.id !== t.id))} className="rounded-full p-0.5 hover:bg-accent/20 focus-ring" aria-label="Quitar"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Escribe un mensaje…  (@ persona · / tarea)"
          className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm outline-none transition focus:border-accent"
        />
        <button onClick={submit} disabled={!text.trim() && people.length === 0 && pendingTasks.length === 0}
          className={cn("inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white transition focus-ring active:scale-95 disabled:opacity-40")}
          aria-label="Enviar">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
