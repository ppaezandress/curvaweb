"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, X, Check, RefreshCw } from "lucide-react";
import { useCelebrate } from "@/lib/celebrate-context";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatDuration } from "@/lib/format";
import { addReaction } from "@/lib/reactions";
import { backdrop, fadeUp, staggerContainer } from "@/lib/motion";

// Spring con un pelín de rebote — es el momento de celebración, sí queremos que "brinque".
const CELEBRATE_SPRING = { type: "spring" as const, stiffness: 300, damping: 22 };

const EMOJIS = ["🔥", "🎉", "😮‍💨", "💪", "🧠", "😴", "🙌", "😅"];
const PHRASES = ["¡Tarea cerrada!", "¡Bien hecho!", "Una menos 💥", "¡A celebrar!", "¡Lo lograste!"];

export function DoneCelebration() {
  const { celebrating, dismiss } = useCelebrate();
  const { sessionSecondsForTask } = useApp();
  const { taskById } = useData();
  const [emoji, setEmoji] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const phrase = useRef(PHRASES[Math.floor((Date.now() / 1000) % PHRASES.length)]);

  // Reset al abrir/cerrar
  useEffect(() => {
    if (!celebrating) {
      setEmoji(null); setPhoto(null);
      if (photoURL) URL.revokeObjectURL(photoURL);
      setPhotoURL(null); stopCam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrating]);

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  };

  const startCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setCamOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      /* permiso denegado: seguimos con emoji */
    }
  };

  const snap = () => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = 480; canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // recorte cuadrado centrado, espejo
    const side = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - side) / 2;
    const sy = (v.videoHeight - side) / 2;
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        setPhoto(blob);
        setPhotoURL(URL.createObjectURL(blob));
      }
      stopCam();
    }, "image/jpeg", 0.85);
  };

  const save = async () => {
    if (!celebrating) return;
    await addReaction({
      taskId: celebrating.taskId,
      taskName: celebrating.taskName,
      emoji: emoji || "🎉",
      photo,
    });
    dismiss();
  };

  // Total REAL en la tarea: lo previo (Notion) + todas las sesiones (la recién cerrada ya entró).
  const task = celebrating ? taskById[celebrating.taskId] : undefined;
  const totalSec = celebrating ? (task?.baselineSeconds ?? 0) + sessionSecondsForTask(celebrating.taskId) : 0;

  return (
    <AnimatePresence>
      {celebrating && (
    <motion.div
      variants={backdrop}
      initial="hidden"
      animate="visible"
      exit="hidden"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      {/* confetti emoji simple */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="confetti" style={{ left: `${(i * 7 + 4) % 100}%`, animationDelay: `${(i % 7) * 0.15}s` }}>
            {EMOJIS[i % EMOJIS.length]}
          </span>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={CELEBRATE_SPRING}
        className="relative w-full max-w-md rounded-t-3xl bg-[var(--surface-solid)] p-6 shadow-float sm:rounded-hero"
      >
        <button onClick={dismiss} className="absolute right-4 top-4 rounded-full p-1.5 text-muted transition hover:bg-surface-2">
          <X size={18} />
        </button>

        <p className="text-sm font-medium text-accent">Tarea completada</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-fg">{phrase.current}</h2>
        <p className="mt-1 truncate text-sm text-muted">{celebrating.taskName}</p>

        {/* Tiempo total invertido en la tarea */}
        <div className="mt-4 rounded-card bg-surface-2 px-4 py-3 text-center">
          <p className="text-xs font-medium text-muted">Tiempo total en esta tarea</p>
          <p className="tabular font-display text-3xl font-bold text-fg">{formatDuration(totalSec)}</p>
        </div>

        {/* Selfie */}
        <div className="mt-5">
          {photoURL ? (
            <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-card">
              <img src={photoURL} alt="tu reacción" className="h-full w-full object-cover" />
              <button onClick={() => { setPhoto(null); if (photoURL) URL.revokeObjectURL(photoURL); setPhotoURL(null); startCam(); }} className="absolute bottom-1 right-1 rounded-full bg-ink/70 p-1.5 text-white">
                <RefreshCw size={14} />
              </button>
            </div>
          ) : camOn ? (
            <div className="mx-auto flex w-fit flex-col items-center gap-2">
              <video ref={videoRef} className="h-40 w-40 -scale-x-100 rounded-card object-cover" muted playsInline />
              <button onClick={snap} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
                <Camera size={15} /> Capturar
              </button>
            </div>
          ) : (
            <button onClick={startCam} className="mx-auto flex h-20 w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line text-sm font-medium text-muted transition hover:border-accent hover:text-accent">
              <Camera size={18} /> Tómate una selfie de tu reacción (opcional)
            </button>
          )}
        </div>

        {/* Emoji */}
        <p className="mt-5 mb-2 text-sm font-semibold text-muted">¿Cómo te sentiste?</p>
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex flex-wrap gap-1.5">
          {EMOJIS.map((e) => (
            <motion.button variants={fadeUp} key={e} onClick={() => setEmoji(e)} whileTap={{ scale: 0.9 }} className={`rounded-control px-3 py-2 text-xl transition-colors ${emoji === e ? "bg-accent/10 ring-2 ring-accent" : "hover:bg-surface-2"}`}>
              {e}
            </motion.button>
          ))}
        </motion.div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={dismiss} className="rounded-full px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-2">Saltar</button>
          <button onClick={save} className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            <Check size={15} /> Guardar al muro
          </button>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
