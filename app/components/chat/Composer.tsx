"use client";

import { useMemo, useRef, useState } from "react";
import { Send, ListTodo, X } from "lucide-react";
import type { Task } from "@/lib/mock-data";
import { taskToken } from "@/lib/notion-url";
import { cn } from "@/lib/cn";

// Composer con autocompletado de @tarea (chip → enlaza a Notion al enviar).
export function Composer({ tasks, onSend }: { tasks: Task[]; onSend: (body: string) => void }) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState<string | null>(null); // texto tras "@" en curso
  const [pending, setPending] = useState<Task[]>([]); // tareas mencionadas
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (query == null) return [];
    const q = query.toLowerCase();
    return tasks.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, tasks]);

  const onChange = (v: string) => {
    setText(v);
    const m = v.match(/@([^@]*)$/); // "@..." al final
    setQuery(m ? m[1] : null);
  };

  const pickTask = (t: Task) => {
    setText((v) => v.replace(/@([^@]*)$/, "").trimEnd());
    setQuery(null);
    setPending((p) => (p.some((x) => x.id === t.id) ? p : [...p, t]));
    inputRef.current?.focus();
  };

  const removePending = (id: string) => setPending((p) => p.filter((x) => x.id !== id));

  const submit = () => {
    const tokens = pending.map((t) => taskToken(t.id, t.name)).join(" ");
    const body = [text.trim(), tokens].filter(Boolean).join(" ");
    if (!body) return;
    onSend(body);
    setText(""); setPending([]); setQuery(null);
  };

  return (
    <div className="relative border-t border-line pt-3">
      {/* Dropdown de tareas */}
      {query != null && matches.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 max-h-64 w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-white shadow-float">
          <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Mencionar tarea</p>
          {matches.map((t) => (
            <button key={t.id} onClick={() => pickTask(t)} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-zinc-50 focus-ring">
              <ListTodo size={14} className="shrink-0 text-curva-purple" />
              <span className="truncate text-sm text-ink">{t.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Chips de tareas mencionadas */}
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pending.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-curva-purple/10 py-0.5 pl-2 pr-1 text-xs font-medium text-curva-purple">
              <ListTodo size={11} /> <span className="max-w-[160px] truncate">{t.name}</span>
              <button onClick={() => removePending(t.id)} className="rounded-full p-0.5 hover:bg-curva-purple/20 focus-ring" aria-label="Quitar"><X size={11} /></button>
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
          placeholder="Escribe un mensaje…  (@ para mencionar una tarea)"
          className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm outline-none transition focus:border-curva-purple"
        />
        <button onClick={submit} disabled={!text.trim() && pending.length === 0}
          className={cn("inline-flex h-10 w-10 items-center justify-center rounded-full bg-curva-purple text-white transition focus-ring active:scale-95 disabled:opacity-40")}
          aria-label="Enviar">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
