// Fuente única de movimiento para CURVA Tiempos.
// Mapea los tokens de diseño de globals.css (--ease-*, --dur-*) a valores de Motion
// para que las animaciones JS (AnimatePresence, layout, springs) queden coherentes con
// las transiciones CSS. Importar SIEMPRE desde "motion/react" (no "framer-motion").
//
// Filosofía (design system del producto): ease-out fuertes, nunca ease-in en UI;
// duraciones cortas; springs con buen damping (sin rebote chicloso). reduced-motion lo
// resuelve <MotionConfig reducedMotion="user"> en (app)/layout.tsx.

import type { Transition, Variants } from "motion/react";

// Easings (espejo de globals.css:20-23). Motion acepta cubic-bezier como [x1,y1,x2,y2].
export const EASE_CURVA = [0.16, 1, 0.3, 1] as const; // --ease-curva (estándar del producto)
export const EASE_OUT = [0.23, 1, 0.32, 1] as const; // --ease-out (entrar/salir)
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const; // --ease-in-out (mover/morph)
export const EASE_PITCH = [0.6, 0, 0.05, 1] as const; // --ease-pitch (snap de reveals)

// Duraciones en segundos (espejo de globals.css:127-129, que están en ms).
export const DUR_FAST = 0.16; // --dur-fast
export const DUR_BASE = 0.28; // --dur-base
export const DUR_SLOW = 0.52; // --dur-slow

// Springs reutilizables.
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 380, damping: 32, mass: 0.9 };
export const SPRING_GENTLE: Transition = { type: "spring", stiffness: 140, damping: 20 };
export const SPRING_DOCK: Transition = { type: "spring", stiffness: 500, damping: 34, mass: 0.8 };

// Tween corto ease-out, el default para fades.
export const TWEEN_FAST: Transition = { duration: DUR_FAST, ease: EASE_OUT };
export const TWEEN_BASE: Transition = { duration: DUR_BASE, ease: EASE_CURVA };

// ─── Variants reutilizables ───────────────────────────────────────────────

// Fondo oscuro de overlays (scrim). Solo opacidad → nunca recorta al hijo fixed.
export const backdrop: Variants = {
  hidden: { opacity: 0, transition: TWEEN_FAST },
  visible: { opacity: 1, transition: TWEEN_FAST },
};

// Panel de modal/diálogo. Pop suave (sirve tanto para bottom-sheet móvil como centrado
// en desktop): sube un poco + escala + opacidad, con spring al entrar y tween al salir.
export const panel: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING_SNAPPY },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: DUR_FAST, ease: EASE_OUT } },
};

// Popover/menú anclado. Requiere transform-origin en el elemento (p. ej. clase
// origin-top-right) para que crezca desde su ancla.
export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: -4, transition: { duration: DUR_FAST, ease: EASE_OUT } },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR_FAST, ease: EASE_CURVA } },
};

// Entrada suave hacia arriba (reveals, stagger de tarjetas/stats).
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: TWEEN_BASE },
};

// Contenedor que escalona a sus hijos (usar con fadeUp en los hijos).
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

// Chip del dock (reemplaza .dock-in): entra desde abajo con spring firme.
export const dockChip: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.9 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING_DOCK },
  exit: { opacity: 0, y: 8, scale: 0.9, transition: { duration: DUR_FAST, ease: EASE_OUT } },
};

// Banner que baja desde arriba (StaleTimerNotice y avisos fixed superiores).
export const dropBanner: Variants = {
  hidden: { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0, transition: SPRING_SNAPPY },
  exit: { opacity: 0, y: -12, transition: { duration: DUR_FAST, ease: EASE_OUT } },
};
