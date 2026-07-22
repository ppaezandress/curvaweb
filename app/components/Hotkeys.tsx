"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/app-context";
import { commandForKey, resolveCommand } from "@/lib/timer-commands";

// Atajos de teclado:
//  - Espacio: pausa / reanuda la tarea activa (o la primera pestaña).
//  - 1-9: cambia a la n-ésima pestaña abierta.
//
// La semántica vive en lib/timer-commands.ts, compartida con el control por gestos: así el
// teclado y la mano no pueden significar cosas distintas, y el comportamiento está probado
// en tests/unit/timer-commands.test.ts.
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

      const cmd = commandForKey({ code: e.code, key: e.key });
      if (!cmd) return;

      const action = resolveCommand(cmd, { openTasks, activeTaskId: active?.taskId ?? null });
      // Espacio se traga siempre (si no, hace scroll); los números solo cuando hacen algo.
      if (cmd.kind === "toggle" && openTasks.length > 0) e.preventDefault();
      if (!action) return;
      if (cmd.kind === "switch") e.preventDefault();

      if (action.kind === "pause") pause();
      else switchTo(action.taskId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTasks, active, switchTo, pause]);

  return null;
}
