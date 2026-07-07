"use client";

import { useEffect, useRef } from "react";

/**
 * Comportamiento común de overlays (modales, drawers, hojas): Escape cierra y el
 * scroll del body se bloquea mientras está abierto.
 *
 * IMPORTANTE — por qué existe este hook: `onClose` casi siempre llega como callback
 * inline desde el padre (`onClose={() => setOpen(false)}`), que cambia de identidad
 * en CADA render. Si lo metes en las deps de un `useEffect` que hace trabajo pesado
 * (fetch, requestAnimationFrame, focus, scroll-lock), el efecto se re-ejecuta en cada
 * render del padre. Y si el padre re-renderiza cada segundo (p. ej. un cronómetro en
 * vivo), eso dispara ese trabajo CADA SEGUNDO → la app se traba. Pasó de verdad en
 * `Modal` y en `TaskDetailDrawer`.
 *
 * La solución que encapsula este hook: leer `onClose` por ref y depender SOLO de
 * `[open]`, para que el efecto corra una vez al abrir y una al cerrar, nunca por tick.
 * Reúsalo en cualquier overlay nuevo en vez de reimplementar Escape + scroll-lock.
 */
export function useOverlay(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  // Mantener la ref al día sin re-ejecutar el efecto de abajo.
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);
}
