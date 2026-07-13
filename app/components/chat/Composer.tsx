"use client";
import { toast } from "@/lib/toast";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Send, ListTodo, AtSign, X, Paperclip, Mic, Loader2, Music, Trash2, Video, Reply, CalendarPlus } from "lucide-react";
import type { Task, Member } from "@/lib/mock-data";
import { taskToken, userToken } from "@/lib/notion-url";
import { getSupabase } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { VideoRecorder } from "@/components/chat/VideoRecorder";
import { cn } from "@/lib/cn";

type Trigger = { kind: "user" | "task"; query: string } | null;
export type Attachment = { url: string; type: "image" | "video" | "audio" };

const kindOf = (mime: string): Attachment["type"] =>
  mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "image";

// Handle imperativo para que el padre (área del chat) pueda inyectar un archivo
// soltado con drag & drop y reutilizar el mismo camino de subida/preview.
export type ComposerHandle = { addFile: (file: File) => void };

type ComposerProps = { tasks: Task[]; members: Member[]; onSend: (body: string, attachment?: Attachment) => void; onTyping?: () => void; chromeless?: boolean; replyingTo?: { name: string; preview: string } | null; onCancelReply?: () => void; onEvent?: () => void };

// Composer estilo Slack: "@" menciona personas, "/" menciona tareas (→ Notion).
// Adjuntos: imagen / video / audio (subir archivo, grabar audio o soltar del escritorio).
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer({ tasks, members, onSend, onTyping, chromeless = false, replyingTo, onCancelReply, onEvent }, ref) {
  const [text, setText] = useState("");
  const [trigger, setTrigger] = useState<Trigger>(null);
  const [people, setPeople] = useState<Member[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [showVideoRec, setShowVideoRec] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[] } | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const lastTyping = useRef(0);

  useEffect(() => () => { if (recTimer.current) clearInterval(recTimer.current); }, []);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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

  // El área del chat (padre) puede soltar un archivo aquí vía drag & drop.
  useImperativeHandle(ref, () => ({ addFile: (f: File) => onFile(f) }));

  // Grabar audio con el micrófono. Safari es quisquilloso con MediaRecorder: hay que
  // elegir un mimeType soportado y pedir chunks periódicos (timeslice), o el blob
  // sale vacío y "no se manda nada". Elegimos mp4 (Safari) o webm/opus (Chrome/FF).
  // Descarta la grabación sin enviarla.
  const cancelRecord = () => {
    cancelledRef.current = true;
    recRef.current?.rec.stop();
  };

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
      const cleanup = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
      };
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onerror = () => { cleanup(); toast("Se interrumpió la grabación. Intenta de nuevo.", { tone: "error" }); };
      rec.onstop = () => {
        cleanup();
        if (cancelledRef.current) return; // se descartó a propósito (botón cancelar)
        const type = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (blob.size === 0) { toast("No se grabó audio (revisa el permiso del micrófono).", { tone: "error" }); return; }
        const ext = type.includes("mp4") || type.includes("mpeg") ? "m4a" : type.includes("webm") ? "webm" : "dat";
        uploadBlob(blob, ext, true); // audio grabado → se manda solo
      };
      recRef.current = { rec, chunks };
      cancelledRef.current = false;
      setRecSecs(0);
      recTimer.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
      rec.start(1000); // timeslice de 1s: Safari sí emite dataavailable
      setRecording(true);
    } catch (err) {
      // Mensaje según la causa real, para no dejar al usuario adivinando.
      const name = (err as { name?: string })?.name || "";
      if (typeof window !== "undefined" && !window.isSecureContext) {
        toast("Para grabar audio abre la app en https o en 127.0.0.1 (no la IP de red).", { tone: "error" });
      } else if (name === "NotAllowedError" || name === "SecurityError") {
        toast("Micrófono bloqueado. Permítelo en el navegador (y en Ajustes de macOS → Privacidad → Micrófono).", { tone: "error" });
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        toast("No se encontró un micrófono conectado.", { tone: "error" });
      } else {
        toast("No se pudo acceder al micrófono" + (name ? ` (${name}).` : "."), { tone: "error" });
      }
    }
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
    <div className={chromeless ? "relative" : "relative border-t border-line pt-3"}>
      {/* Respondiendo a un mensaje (estilo Slack) */}
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 rounded-control border-l-2 border-accent bg-surface-2/60 px-3 py-1.5">
          <Reply size={13} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted"><b className="text-fg">Respondiendo a {replyingTo.name.split(" ")[0]}</b> · {replyingTo.preview}</span>
          <button onClick={onCancelReply} className="rounded-full p-1 text-muted transition hover:bg-surface-2 hover:text-fg focus-ring" aria-label="Cancelar respuesta"><X size={13} /></button>
        </div>
      )}
      {/* Dropdown de autocompletado */}
      {trigger && matches.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 max-h-64 w-full max-w-md overflow-y-auto rounded-card border border-line bg-[var(--surface-solid)] shadow-float">
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

      {/* Preview del adjunto — miniatura real de foto/video antes de mandar */}
      {(attach || uploading) && (
        <div className="mb-2">
          {uploading ? (
            <div className="inline-flex items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2 text-xs font-medium text-muted">
              <Loader2 size={14} className="animate-spin" /> Subiendo…
            </div>
          ) : attach ? (
            <div className="relative inline-block">
              {attach.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attach.url} alt="Vista previa" className="max-h-32 rounded-control border border-line object-cover" />
              ) : attach.type === "video" ? (
                <video src={attach.url} muted playsInline className="max-h-32 rounded-control border border-line" />
              ) : (
                <div className="inline-flex items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2 text-xs font-medium text-muted"><Music size={14} className="text-accent" /> Audio listo</div>
              )}
              <button onClick={() => setAttach(null)} className="absolute -right-2 -top-2 rounded-full bg-ink p-1 text-white shadow-soft transition focus-ring active:scale-90" aria-label="Quitar adjunto"><X size={12} /></button>
            </div>
          ) : null}
        </div>
      )}

      {recording ? (
        // Barra de grabación tipo WhatsApp: latido + cronómetro + cancelar / enviar.
        <div className="flex items-center gap-2 rounded-card border border-danger/40 bg-danger/[0.06] px-3 py-2">
          <span className="curva-live-dot inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />
          <span className="tabular text-sm font-bold text-danger">{mmss(recSecs)}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted">Grabando… suelta para enviar</span>
          <button onClick={cancelRecord} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium text-muted transition hover:border-danger hover:text-danger focus-ring active:scale-95" aria-label="Cancelar grabación">
            <Trash2 size={15} /> <span className="hidden sm:inline">Cancelar</span>
          </button>
          <button onClick={toggleRecord} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white shadow-sm shadow-accent/20 transition hover:opacity-90 focus-ring active:scale-95" aria-label="Enviar audio">
            <Send size={15} /> Enviar
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:border-accent hover:text-accent focus-ring active:scale-90 disabled:opacity-40" aria-label="Adjuntar archivo" title="Adjuntar imagen, video o audio">
            <Paperclip size={16} />
          </button>
          <button onClick={toggleRecord} disabled={uploading} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:border-accent hover:text-accent focus-ring active:scale-90 disabled:opacity-40" aria-label="Grabar audio" title="Grabar un audio (se manda al soltar)">
            <Mic size={16} />
          </button>
          <button onClick={() => setShowVideoRec(true)} disabled={uploading} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:border-accent hover:text-accent focus-ring active:scale-90 disabled:opacity-40" aria-label="Grabar video" title="Grabar un video con la cámara">
            <Video size={16} />
          </button>
          {onEvent && (
            <button onClick={onEvent} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:border-accent hover:text-accent focus-ring active:scale-90" aria-label="Crear junta" title="Crear junta / evento con invitación">
              <CalendarPlus size={16} />
            </button>
          )}
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            placeholder="Escribe un mensaje…  (@ persona · / tarea · 📎 adjunta)"
            className="max-h-32 flex-1 resize-none rounded-card border border-line px-4 py-2.5 text-sm outline-none focus-ring transition [field-sizing:content] focus:border-accent"
          />
          <button onClick={submit} disabled={uploading || (!text.trim() && people.length === 0 && pendingTasks.length === 0 && !attach)}
            className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition focus-ring active:scale-95 disabled:opacity-40")}
            aria-label="Enviar">
            <Send size={16} />
          </button>
        </div>
      )}

      <VideoRecorder
        open={showVideoRec}
        uploading={uploading}
        onClose={() => setShowVideoRec(false)}
        onRecorded={(blob, ext) => { setShowVideoRec(false); uploadBlob(blob, ext, true); }}
      />
    </div>
  );
});
