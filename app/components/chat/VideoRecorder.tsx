"use client";

import { useEffect, useRef, useState } from "react";
import { X, Video, Square, Trash2, Send, Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";

// Grabador de video "nota" (como la nota de voz, pero video): abre la cámara con
// preview en vivo, graba, y al detener sube + manda. Cancelar descarta.
export function VideoRecorder({
  open,
  onClose,
  onRecorded,
  uploading,
}: {
  open: boolean;
  onClose: () => void;
  onRecorded: (blob: Blob, ext: string) => void;
  uploading: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [ready, setReady] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Abre / reabre la cámara al montar y al cambiar de cámara (frontal/trasera).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setReady(false);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: true });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}); }
        setReady(true);
      } catch (err) {
        const name = (err as { name?: string })?.name || "";
        if (typeof window !== "undefined" && !window.isSecureContext) toast("Para grabar video abre la app en https.", { tone: "error" });
        else if (name === "NotAllowedError" || name === "SecurityError") toast("Cámara/micrófono bloqueados. Permítelos en el navegador (y en Ajustes de macOS → Privacidad).", { tone: "error" });
        else if (name === "NotFoundError") toast("No se encontró cámara.", { tone: "error" });
        else toast("No se pudo abrir la cámara" + (name ? ` (${name}).` : "."), { tone: "error" });
        onClose();
      }
    })();
    return () => { alive = false; stopStream(); setRecording(false); setSecs(0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  const startRec = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const canCheck = typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function";
    const mimeType = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => canCheck && MediaRecorder.isTypeSupported(t));
    const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunksRef.current = [];
    cancelledRef.current = false;
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onerror = () => { setRecording(false); toast("Se interrumpió la grabación.", { tone: "error" }); };
    rec.onstop = () => {
      setRecording(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (cancelledRef.current) return;
      const type = rec.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size === 0) { toast("No se grabó video.", { tone: "error" }); return; }
      const ext = type.includes("mp4") ? "mp4" : "webm";
      onRecorded(blob, ext);
    };
    recRef.current = rec;
    setSecs(0);
    timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    rec.start(1000);
    setRecording(true);
  };

  const stopAndSend = () => recRef.current?.stop();
  const cancel = () => {
    if (recording) { cancelledRef.current = true; recRef.current?.stop(); }
    onClose();
  };

  if (!open) return null;
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={cancel}>
      <div
        className="modal-panel flex w-full max-w-sm flex-col items-center gap-4 rounded-hero bg-surface p-5 shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg"><Video size={16} className="text-accent" /> Grabar video</span>
          <button onClick={cancel} className="rounded-full p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg focus-ring" aria-label="Cerrar"><X size={18} /></button>
        </div>

        {/* Preview de la cámara — cuadrado tipo nota de video, espejo si es frontal */}
        <div className="relative aspect-square w-full overflow-hidden rounded-hero bg-ink">
          <video ref={videoRef} muted playsInline autoPlay className={cn("h-full w-full object-cover", facing === "user" && "-scale-x-100")} />
          {!ready && <div className="absolute inset-0 flex items-center justify-center text-white/70"><Loader2 size={22} className="animate-spin" /></div>}
          {recording && (
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-ink/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
              <span className="curva-live-dot inline-block h-2 w-2 rounded-full bg-danger" /> <span className="tabular">{mmss}</span>
            </div>
          )}
          {ready && !recording && (
            <button onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} className="absolute right-3 top-3 rounded-full bg-ink/60 p-2 text-white backdrop-blur transition hover:bg-ink/80 focus-ring active:scale-90" aria-label="Cambiar cámara" title="Cambiar cámara"><RefreshCw size={15} /></button>
          )}
        </div>

        {/* Controles */}
        <div className="flex w-full items-center justify-center gap-4">
          {!recording ? (
            <button
              onClick={startRec}
              disabled={!ready || uploading}
              className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-danger text-white shadow-sm shadow-danger/30 transition hover:opacity-90 focus-ring active:scale-90 disabled:opacity-40"
              aria-label="Empezar a grabar"
            >
              {uploading ? <Loader2 size={22} className="animate-spin" /> : <Video size={22} fill="currentColor" />}
            </button>
          ) : (
            <>
              <button onClick={cancel} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:border-danger hover:text-danger focus-ring active:scale-90" aria-label="Cancelar"><Trash2 size={18} /></button>
              <button onClick={stopAndSend} className="inline-flex h-14 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-white shadow-sm shadow-accent/20 transition hover:opacity-90 focus-ring active:scale-95" aria-label="Detener y enviar">
                <Send size={17} /> Enviar
              </button>
              <span className="inline-flex h-11 w-11 items-center justify-center text-danger"><Square size={16} fill="currentColor" /></span>
            </>
          )}
        </div>
        <p className="text-caption text-muted">{recording ? "Toca Enviar para mandar tu video." : "Toca el botón rojo para empezar a grabar."}</p>
      </div>
    </div>
  );
}
