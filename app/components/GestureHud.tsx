"use client";

import { motion, AnimatePresence } from "motion/react";
import { X, Hand, VideoOff } from "lucide-react";
import { GESTURE_EMOJI, type Gesture } from "@/lib/gestures/vocabulary";
import { dockChip, SPRING_SNAPPY, TWEEN_FAST } from "@/lib/motion";

// HUD del control por gestos.
//
// Idea rectora: esto tiene que leerse como un INSTRUMENTO, nunca como una cámara vigilando.
// El design system del producto ("el estudio ordenado") es sereno y explícitamente no quiere
// sentirse como software de control — así que el preview es diminuto y circular (no un espejo
// de videollamada), en reposo la píldora casi desaparece, y el punto vivo está siempre a la
// vista para que jamás haya duda de que la cámara está encendida. Apagarla es un clic.
//
// La única animación protagonista es el anillo de dwell, y rodea tu propia mano: llenarse es
// la promesa de "esto va a pasar" y da tiempo de arrepentirse antes de que pase.

const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

export type GestureHudProps = {
  candidate: Gesture | null;
  progress: number;
  cooling: boolean;
  /** Qué haría el gesto actual, en palabras ("Propuesta Balmori" / "Pausar"). */
  hint: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onStop: () => void;
  /** En el laboratorio se muestra suelto, sin el desplazamiento del dock. */
  standalone?: boolean;
};

export function GestureHud({ candidate, progress, cooling, hint, videoRef, onStop, standalone }: GestureHudProps) {
  return (
    <motion.div
      variants={dockChip}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
      className={
        standalone
          ? "inline-flex"
          : // A la derecha, por ENCIMA del botón de Feedback (que en escritorio vive en
            // bottom-5 right-4): si se pisan, el HUD tapa una acción del producto. En móvil
            // no se ofrece — la cámara frontal del teléfono no es el contexto de esto.
            "pointer-events-none fixed bottom-20 right-4 z-40 hidden sm:flex"
      }
    >
      <motion.div
        layout
        transition={SPRING_SNAPPY}
        className="pointer-events-auto flex items-center gap-2.5 rounded-hero border border-line bg-surface/92 py-2 pl-2 pr-3 shadow-float backdrop-blur-xl"
      >
        {/* Ojo + anillo de dwell */}
        <div className="relative h-14 w-14 shrink-0">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-hidden
            className="absolute inset-[5px] h-[46px] w-[46px] scale-x-[-1] rounded-full object-cover"
          />
          {/* Velo tenue: baja el realismo del preview para que no parezca una videollamada.
              Se despeja cuando hay un gesto reconocido — la imagen "despierta" al servir. */}
          <div
            className="pointer-events-none absolute inset-[5px] rounded-full bg-surface-2/45 transition-opacity duration-300"
            style={{ opacity: candidate ? 0 : 1 }}
          />
          <svg viewBox="0 0 56 56" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="28" cy="28" r={RING_R} fill="none" stroke="var(--line)" strokeWidth="2.5" />
            <circle
              cx="28" cy="28" r={RING_R} fill="none"
              stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - progress)}
              className="transition-[stroke-dashoffset] duration-100 ease-linear"
              style={{ opacity: candidate ? 1 : 0 }}
            />
          </svg>
          {/* Testigo de cámara encendida. Transparencia por diseño: si está prendida, se ve. */}
          <span
            className="curva-live-dot absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface"
            aria-hidden
          />
        </div>

        {/* Estado en palabras */}
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {candidate ? (
              <motion.div
                key={candidate}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={TWEEN_FAST}
                className="flex min-w-0 flex-col"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-fg">
                  <span aria-hidden className="text-base leading-none">{GESTURE_EMOJI[candidate]}</span>
                  <span className="max-w-[168px] truncate">{hint || "Listo"}</span>
                </span>
                <span className="text-caption text-muted">sostén para confirmar</span>
              </motion.div>
            ) : (
              <motion.div
                key={cooling ? "cooling" : "idle"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={TWEEN_FAST}
                className="flex items-center gap-1.5 text-caption font-medium text-muted"
              >
                <Hand size={13} aria-hidden />
                {cooling ? "Listo" : "Esperando tu mano"}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={onStop}
          className="focus-ring -mr-1 shrink-0 rounded-md p-1 text-muted/70 transition hover:text-danger"
          aria-label="Apagar la cámara y el control por gestos"
          title="Apagar la cámara"
        >
          <X size={15} />
        </button>
      </motion.div>
    </motion.div>
  );
}

/** Aviso compacto cuando la cámara no se pudo encender. */
export function GestureError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <motion.div
      variants={dockChip}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="pointer-events-auto fixed bottom-20 right-4 z-40 hidden max-w-xs items-start gap-2.5 rounded-hero border border-line bg-surface px-4 py-3 text-sm text-fg shadow-float sm:flex"
    >
      <VideoOff size={16} className="mt-0.5 shrink-0 text-muted" />
      <span className="min-w-0 flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="focus-ring -mr-1 shrink-0 rounded-md p-0.5 text-muted transition hover:text-fg"
        aria-label="Cerrar"
      >
        <X size={15} />
      </button>
    </motion.div>
  );
}
