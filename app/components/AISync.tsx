"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";

const ACT_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;

// Sincroniza el cronómetro del dock con el conector de IA (Claude Code/Desktop):
//  1. La IA empieza → tu tarea activa pasa a "IA" (visual; el conector registra el tiempo).
//  2. La IA termina → la tarea queda EN PAUSA (no cuenta tiempo: ni IA ni manual).
//  3. Cuando vuelves a moverte (mouse/teclado) → reanuda el conteo a mano.
export function AISync() {
  const { currentUserId, active, startAI, stopAI, switchTo } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const email = me?.email;

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);
  const fns = useRef({ startAI, stopAI, switchTo });
  useEffect(() => { fns.current = { startAI, stopAI, switchTo }; });

  const wasLive = useRef(false);
  const autoTask = useRef<string | null>(null);      // tarea que la IA está trabajando
  const pendingResume = useRef<string | null>(null); // tarea pausada esperando que vuelvas a moverte

  // Polling del estado del conector
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const d = await fetch(`/api/timing/live?u=${encodeURIComponent(email)}`).then((r) => r.json());
        const liveNow = (d.active || []).length > 0;
        if (liveNow && !wasLive.current) {
          // La IA empezó → pasa a IA tu tarea activa (o la que quedó pendiente).
          const t = activeRef.current?.taskId ?? pendingResume.current;
          if (t) { autoTask.current = t; pendingResume.current = null; fns.current.startAI(t, { autoResume: null, silent: true }); }
        } else if (!liveNow && wasLive.current) {
          // La IA terminó → PAUSA la tarea (no cuenta tiempo) y queda pendiente de que vuelvas.
          const t = autoTask.current;
          if (t) { fns.current.stopAI(t); pendingResume.current = t; autoTask.current = null; }
        }
        wasLive.current = liveNow;
      } catch { /* */ }
    };
    tick();
    const id = setInterval(() => { if (!cancelled) tick(); }, 1500);
    return () => { cancelled = true; clearInterval(id); };
  }, [email]);

  // Al volver a haber actividad tuya, reanuda el conteo a mano de la tarea pendiente.
  useEffect(() => {
    const onAct = () => {
      const t = pendingResume.current;
      if (t) { pendingResume.current = null; fns.current.switchTo(t); }
    };
    ACT_EVENTS.forEach((e) => window.addEventListener(e, onAct, { passive: true }));
    return () => ACT_EVENTS.forEach((e) => window.removeEventListener(e, onAct));
  }, []);

  return null;
}
