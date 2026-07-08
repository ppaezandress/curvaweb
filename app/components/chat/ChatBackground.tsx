"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  backgroundStyle, needsScrim, scrimStyle, intensityOf, backgroundKey,
  type ChatBackground as Bg,
} from "@/lib/chat-backgrounds";

// Capa de relleno (color/gradiente/patrón/imagen) + scrim de legibilidad.
// Se comparte entre el chat real y el preview del picker para que se vean idénticos.
function Fill({ bg }: { bg: Bg }) {
  return (
    <>
      <div className="absolute inset-0" style={{ ...backgroundStyle(bg), opacity: intensityOf(bg) }} />
      {needsScrim(bg) && <div className="absolute inset-0" style={scrimStyle(bg)} />}
    </>
  );
}

// Fondo del canal detrás de los mensajes (z-0). El contenido va en un wrapper z-10.
// Al cambiar de fondo hace crossfade suave (respeta prefers-reduced-motion → instantáneo).
export function ChatBackground({ bg }: { bg: Bg | null | undefined }) {
  const reduce = useReducedMotion();
  if (!bg || bg.kind === "none") return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.div
          key={backgroundKey(bg)}
          className="absolute inset-0"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <Fill bg={bg} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Preview en vivo para el picker: caja redondeada con el fondo real + burbujas de muestra.
export function ChatBackgroundPreview({ bg, className = "" }: { bg: Bg; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-tile border border-line ${className}`}>
      {bg.kind !== "none" ? <Fill bg={bg} /> : <div className="absolute inset-0 bg-surface-2/40" />}
      <div className="relative z-10 flex h-full flex-col justify-end gap-1.5 p-3">
        <span className="max-w-[70%] self-start rounded-2xl rounded-bl-sm bg-surface px-3 py-1.5 text-caption text-fg shadow-soft backdrop-blur-sm">
          ¿Vieron el nuevo fondo? ✨
        </span>
        <span className="max-w-[70%] self-end rounded-2xl rounded-br-sm bg-accent px-3 py-1.5 text-caption font-medium text-white shadow-soft">
          Quedó increíble
        </span>
      </div>
    </div>
  );
}
