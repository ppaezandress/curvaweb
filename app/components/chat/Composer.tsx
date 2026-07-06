"use client";
import { toast } from "@/lib/toast";

import { useMemo, useRef, useState } from "react";
import { Send, ListTodo, AtSign, X, Paperclip, Mic, Square, Loader2, ImageIcon, Film, Music } from "lucide-react";
import type { Task, Member } from "@/lib/mock-data";
import { taskToken, userToken } from "@/lib/notion-url";
import { getSupabase } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/cn";

type Trigger = { kind: "user" | "task"; query: string } | null;
export type Attachment = { url: string; type: "image" | "video" | "audio" };

const kindOf = (mime: string): Attachment["type"] =>
  mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "image";

// Composer estilo Slack: "@" menciona personas, "/" menciona tareas (→ Notion).
// Adjuntos: imagen / video / audio (subir archivo o grabar audio).
export function Composer({ tasks, members, onSend, onTyping }: { tasks: Task[]; members: Member[]; onSend: (body: string, attachment?: Attachment) => void; onTyping?: () => void }) {
  const [text, setText] = useState("");
  const [trigger, setTrigger] = useState<Trigger>(null);
  const [people, setPeople] = useState<Member[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[] } | null>(null);
  const lastTyping = useRef(0);

  const matches = useMemo(() => {
    if (!trigger) return [] as (Member | Task)[];
    const q = trigger.query.toLowerCase();
    if (trigger.kind === "user") return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
    return tasks.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 6);
  }, [trigger, members, tasks]);

  const onChange = (v: string) => {
    setText(v);
    const now = Date.now();
    if (onTyping && v.trim() && now - lastTyping.current > 1500) { lastTyping.current = now; onTyping(); }
    const at = v.match(/@([^@/\s][^@/]*|)$/);
    const slash = v.match(/\/([^/@\s][^/@]*|)$/);
    if (at) setTrigger({ kind: "user", query: at[1] });
    else if (slash) setTrigger({ kind: "task", query: slash[1] });
    else setTrigger(null);
  };

  const stripTrigger = () => setText((v) => v.replace(/[@/]([^@/]*)$/, "").trimEnd());
  const pickPerson = (m: Member) => { stripTrigger(); setTrigger(null); setPeople((p) => (p.some((x) => x.id === m.id) ? p : [...p, m])); inputRef.current?.focus(); };
  const pickTask = (t: Task) => { stripTrigger(); setTrigger(null); setPendingTasks((p) => (p.some((x) => x.id === t.id) ? p : [...p, t])); inputRef.current?.focus(); };

  // Sube un blob al bucket chat-media. Con `autoSend` (audio grabado) lo manda al
  // instante — como WhatsApp — en vez de dejarlo esperando otro clic de enviar.
  const uploadBlob = async (blob: Blob, ext: string, autoSend = false) => {
    const sb = getSupabase();
    if (!sb) { toast("No hay conexión para adjuntar. Intenta de nuevo.", { tone: "error" }); return; }
    setUploading(true);
    try {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) { toast("Inicia sesión con tu correo para adjuntar archivos.", { tone: "error" }); return; }
      const path = `${u.user.id}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("chat-media").upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: true });
      if (error) { toast("No se pudo subir el archivo: " + error.message, { tone: "error" }); return; }
      const url = sb.storage.from("chat-media").getPublicUrl(path).data.publicUrl;
      const at: Attachment = { url, type: kindOf(blob.type || "") };
      if (autoSend) onSend("", at);      // el audio se manda solo al soltar
      else setAttach(at);                 // imagen/video: se revisa y se envía con el mensaje
    } finally { setUploading(false); }
  };

  const onFile = (file?: File) => {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    uploadBlob(file, ext);
  };

  // Grabar audio con el micrófono. Safari es quisquilloso con MediaRecorder: hay que
  // elegir un mimeType soportado y pedir chunks periódicos (timeslice), o el blob
  // sale vacío y "no se manda nada". Elegimos mp4 (Safari) o webm/opus (Chrome/FF).
  const toggleRecord = async () => {
    if (recording) {
      recRef.current?.rec.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const canCheck = typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function";
      const mimeType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => canCheck && MediaRecorder.isTypeSupported(t));
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const cleanup = () => { stream.getTracks().forEach((t) => t.stop()); setRecording(false); };
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onerror = () => { cleanup(); toast("Se interrumpió la grabación. Intenta de nuevo.", { tone: "error" }); };
      rec.onstop = () => {
        cleanup();
        const type = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (blob.size === 0) { toast("No se grabó audio (revisa el permiso del micrófono).", { tone: "error" }); return; }
        const ext = type.includes("mp4") || type.includes("mpeg") ? "m4a" : type.includes("webm") ? "webm" : "dat";
        uploadBlob(blob, ext, true); // audio grabado → se manda solo
      };
      recRef.current = { rec, chunks };
      rec.start(1000); // timeslice de 1s: Safari sí emite dataavailable
      setRecording(true);
    } catch { toast("No se pudo acceder al micrófono. Revisa el permiso del navegador.", { tone: "error" }); }
  };

  const submit = () => {
    const tokens = [
      ...people.map((m) => userToken(m.id, m.name)),
      ...pendingTasks.map((t) => taskToken(t.id, t.name)),
    ].join(" ");
    const body = [text.trim(), tokens].filter(Boolean).join(" ");
    if (!body && !attach) return;
    onSend(body, attach || undefined);
    setText(""); setPeople([]); setPendingTasks([]); setTrigger(null); setAttach(null);
  };

  return (
    <div className="relative border-t border-line pt-3">
      {/* Dropdown de autocompletado */}
      {trigger && matches.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 max-h-64 w-full max-w-md overflow-y-auto rounded-card border border-line bg-surface shadow-float">
          <p className="px-3 pt-2 text-caption font-semibold text-muted">
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
            <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-accent/10 py-0.5 pl-2 pr-1 text-xs font-medium text-accent">
              <AtSign size={11} /> <span className="max-w-[140px] truncate">{m.name}</span>
              <button onClick={() => setPeople((p) => p.filter((x) => x.id !== m.id))} className="rounded-full p-0.5 hover:bg-accent/20 focus-ring" aria-label="Quitar"><X size={11} /></button>
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

      {/* Preview del adjunto */}
      {(attach || uploading) && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-control border border-line bg-surface-2 px-2.5 py-1.5">
          {uploading ? <Loader2 size={14} className="animate-spin text-muted" /> : attach?.type === "image" ? <ImageIcon size={14} className="text-accent" /> : attach?.type === "video" ? <Film size={14} className="text-accent" /> : <Music size={14} className="text-accent" />}
          <span className="text-xs font-medium text-muted">{uploading ? "Subiendo…" : `${attach?.type === "image" ? "Imagen" : attach?.type === "video" ? "Video" : "Audio"} listo`}</span>
          {attach && !uploading && <button onClick={() => setAttach(null)} className="rounded-full p-0.5 text-muted hover:bg-surface focus-ring" aria-label="Quitar adjunto"><X size={12} /></button>}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading || recording} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:border-accent hover:text-accent focus-ring disabled:opacity-40" aria-label="Adjuntar archivo" title="Adjuntar imagen, video o audio">
          <Paperclip size={16} />
        </button>
        <button onClick={toggleRecord} disabled={uploading} className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition focus-ring disabled:opacity-40", recording ? "border-danger bg-danger text-white" : "border-line text-muted hover:border-accent hover:text-accent")} aria-label={recording ? "Detener grabación" : "Grabar audio"} title={recording ? "Detener y enviar audio" : "Grabar un audio"}>
          {recording ? <Square size={15} fill="currentColor" /> : <Mic size={16} />}
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          rows={1}
          placeholder={recording ? "Grabando audio… toca ⏹ para enviar" : "Escribe un mensaje…  (@ persona · / tarea · 📎 adjunta)"}
          className="max-h-32 flex-1 resize-none rounded-card border border-line px-4 py-2.5 text-sm outline-none focus-ring transition [field-sizing:content] focus:border-accent"
        />
        <button onClick={submit} disabled={uploading || (!text.trim() && people.length === 0 && pendingTasks.length === 0 && !attach)}
          className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition focus-ring active:scale-95 disabled:opacity-40")}
          aria-label="Enviar">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
