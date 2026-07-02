"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, X, SwitchCamera, RotateCcw, Send } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

type View = "camera" | "preview" | "denied";
type Shot = { blob: Blob; url: string; ext: string };

const EMOJIS = ["👍", "🔥", "🎉", "✅", "🙌", "💪", "🚀", "😅"];

// Captura una foto de la tarea y la "envía" (queda compartida con el equipo y
// aparece en el Recap). Al abrir, la cámara se abre sola; hay un ícono para
// subir un archivo si se prefiere. En el preview: comentario + emojis → Enviar.
export function TaskPhotos({ taskId, taskName, open, onClose }: { taskId: string; taskName: string; open: boolean; onClose: () => void }) {
  const sb = getSupabase();
  const [view, setView] = useState<View>("camera");
  const [shot, setShot] = useState<Shot | null>(null);
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  const clearShot = useCallback(() => {
    setShot((s) => { if (s) URL.revokeObjectURL(s.url); return null; });
    setCaption("");
  }, []);

  const startCam = useCallback(async (mode: "user" | "environment") => {
    try {
      stopCam();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
      streamRef.current = stream;
      setFacing(mode);
      setView("camera");
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 40);
    } catch {
      setView("denied");
    }
  }, [stopCam]);

  // Al abrir: cámara automática.
  useEffect(() => {
    if (!open || !sb) return;
    setView("camera"); clearShot();
    startCam("environment");
  }, [open, sb, startCam, clearShot]);

  useEffect(() => { if (!open) { stopCam(); clearShot(); } }, [open, stopCam, clearShot]);
  useEffect(() => () => stopCam(), [stopCam]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCam();
      setShot({ blob, url: URL.createObjectURL(blob), ext: "jpg" });
      setView("preview");
    }, "image/jpeg", 0.9);
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    stopCam();
    setShot({ blob: f, url: URL.createObjectURL(f), ext: (f.name.split(".").pop() || "jpg").toLowerCase() });
    setView("preview");
  };

  const send = async () => {
    if (!sb || !shot) return;
    setSending(true);
    try {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) { alert("Para subir fotos necesitas iniciar sesión con tu correo y contraseña (no el acceso rápido)."); return; }
      const path = `${u.user.id}/${taskId}/${Date.now()}.${shot.ext}`;
      const { error } = await sb.storage.from("task-photos").upload(path, shot.blob, { upsert: true, contentType: shot.blob.type || "image/jpeg" });
      if (error) { alert("No se pudo subir la foto: " + error.message); return; }
      const { data: pub } = sb.storage.from("task-photos").getPublicUrl(path);
      const { error: insErr } = await sb.from("task_photos").insert({ task_id: taskId, user_id: u.user.id, url: pub.publicUrl, caption: caption.trim() || null });
      if (insErr) { alert("No se pudo guardar la foto: " + insErr.message); return; }
      clearShot();
      onClose(); // enviada → aparece en el Recap del equipo
    } finally { setSending(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Foto de la tarea">
      <p className="-mt-1 mb-4 truncate text-sm text-muted">{taskName}</p>

      {!supabaseConfigured() ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Conecta el backend para subir fotos.</p>
      ) : view === "preview" && shot ? (
        // Preview + comentario + emojis → Enviar
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt="Vista previa" className="aspect-[3/4] w-full rounded-2xl object-cover sm:aspect-video" />
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Agrega un comentario (opcional)…"
            autoFocus
            className="mt-3 w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setCaption((c) => c + e)} className="rounded-lg px-1.5 py-1 text-lg transition hover:bg-surface-2 focus-ring" aria-label={`Agregar ${e}`}>{e}</button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button onClick={() => { clearShot(); startCam(facing); }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted transition hover:bg-surface-2 focus-ring"><RotateCcw size={15} /> Repetir</button>
            <Button onClick={send} disabled={sending}>{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar</Button>
          </div>
        </div>
      ) : view === "denied" ? (
        // Sin cámara → subir archivo
        <div className="rounded-2xl border-2 border-dashed border-line p-6 text-center">
          <p className="text-sm text-muted">No pude abrir la cámara. Puedes subir un archivo o dar permiso e intentar de nuevo.</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => startCam("environment")}>Reintentar cámara</Button>
            <Button onClick={() => fileRef.current?.click()}><ImageIcon size={15} /> Subir archivo</Button>
          </div>
        </div>
      ) : (
        // Cámara (automática) con ícono para subir archivo
        <div className="relative overflow-hidden rounded-2xl bg-zinc-900">
          <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover sm:aspect-video" />
          <button onClick={onClose} aria-label="Cerrar" className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60 focus-ring"><X size={18} /></button>
          <button onClick={() => startCam(facing === "user" ? "environment" : "user")} aria-label="Voltear cámara" className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60 focus-ring"><SwitchCamera size={18} /></button>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-5 pb-4">
            <button onClick={() => fileRef.current?.click()} aria-label="Subir archivo" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60 focus-ring"><ImageIcon size={20} /></button>
            <button onClick={capture} aria-label="Capturar" className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-surface/30 backdrop-blur transition active:scale-95 focus-ring"><span className="h-12 w-12 rounded-full bg-surface shadow" /></button>
            <span className="h-11 w-11" aria-hidden /> {/* balance visual */}
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files)} />
    </Modal>
  );
}
