"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { useAILive } from "@/lib/use-ai-live";

const ACT_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;

// Sincroniza el cronómetro del dock con el estado de IA en vivo (push):
//  1. La IA empieza → tu tarea activa pasa a "IA" (visual; el conector registra el tiempo).
//  2. La IA termina → la tarea queda EN PAUSA (no cuenta tiempo).
//  3. Cuando vuelves a moverte (mouse/teclado) → reanuda el conteo a mano.
// También limpia marcas de IA huérfanas (sin sesión viva).
export function AISync() {
  const { currentUserId, active, aiActive, startAI, stopAI, switchTo } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const live = useAILive(me?.email);

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);
  const aiRef = useRef(aiActive);
  useEffect(() => { aiRef.current = aiActive; }, [aiActive]);
  const fns = useRef({ startAI, stopAI, switchTo });
  useEffect(() => { fns.current = { startAI, stopAI, switchTo }; });

  const wasLive = useRef(false);
  const autoTask = useRef<string | null>(null);
  const pendingResume = useRef<string | null>(null);

  // Reacciona al estado de IA en vivo (instantáneo por push).
  useEffect(() => {
    if (live.live && !wasLive.current) {
      const t = activeRef.current?.taskId ?? pendingResume.current;
      if (t) { autoTask.current = t; pendingResume.current = null; fns.current.startAI(t, { autoResume: null, silent: true }); }
    } else if (!live.live) {
      if (wasLive.current && autoTask.current) {
        const t = autoTask.current;
        fns.current.stopAI(t); pendingResume.current = t; autoTask.current = null;
      }
      // Limpia marcas de IA huérfanas: automáticas (silent:true) y heredadas (silent indefinido).
      // Respeta solo las marcadas a mano con ✨IA (silent:false).
      aiRef.current
        .filter((a) => a.silent !== false && a.taskId !== pendingResume.current)
        .forEach((a) => fns.current.stopAI(a.taskId));
    }
    wasLive.current = live.live;
  }, [live.live]);

  // Al volver a haber actividad tuya, reanuda el conteo a mano de la tarea pendiente.
  useEffect(() => {
    const onAct = () => {
      const t = pendingResume.current;
      if (t) { pendingResume.current = null; fns.current.switchTo(t); }
    };
    ACT_EVENTS.forEach((ev) => window.addEventListener(ev, onAct, { passive: true }));
    return () => ACT_EVENTS.forEach((ev) => window.removeEventListener(ev, onAct));
  }, []);

  return null;
}
