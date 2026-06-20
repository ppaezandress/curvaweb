"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/app-context";

// Atajos de teclado:
//  - Espacio: pausa / reanuda la tarea activa (o la primera pestaña).
//  - 1-9: cambia a la n-ésima pestaña abierta.
export function Hotkeys() {
  const { openTasks, active, switchTo, pause } = useApp();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      // Espacio → pausa/reanuda
      if (e.code === "Space") {
        if (openTasks.length === 0) return;
        e.preventDefault();
        if (active) pause();
        else switchTo(openTasks[0]);
        return;
      }

      // 1-9 → cambiar de pestaña
      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < openTasks.length) {
          e.preventDefault();
          switchTo(openTasks[idx]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTasks, active, switchTo, pause]);

  return null;
}
