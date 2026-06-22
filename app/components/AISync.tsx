"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";

const ACT_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;

// Sincroniza el cronómetro del dock con el conector de IA (Claude Code/Desktop):
//  1. La IA empieza → tu tarea activa pasa a "IA" (visual; el conector registra el tiempo).
//  2. La IA termina → la tarea queda EN PAUSA (no cuenta tiempo: ni IA ni manual).
//  3. Cuando vuelves a moverte (mouse/teclado) → reanuda el conteo a mano.
// Además limpia marcas de IA del conector que quedaron huérfanas (p. ej. tras recargar).
export function AISync() {
  const { currentUserId, active, aiActive, startAI, stopAI, switchTo } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const email = me?.email;

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);
  const aiRef = useRef(aiActive);
  useEffect(() => { aiRef.current = aiActive; }, [aiActive]);
  const fns = useRef({ startAI, stopAI, switchTo });
  useEffect(() => { fns.current = { startAI, stopAI, switchTo }; });

  const wasLive = useRef(false);
  const autoTask = useRef<string | null>(null);
  const pendingResume = useRef<string | null>(null);

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
        } else if (!liveNow) {
          // La IA terminó → PAUSA la tarea (no cuenta) y queda pendiente de que vuelvas.
          if (wasLive.current && autoTask.current) {
            const t = autoTask.current;
            fns.current.stopAI(t); pendingResume.current = t; autoTask.current = null;
          }
          // Limpia marcas de IA del conector que quedaron huérfanas (sin sesión viva).
          aiRef.current
            .filter((a) => a.silent && a.taskId !== pendingResume.current)
            .forEach((a) => fns.current.stopAI(a.taskId));
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
