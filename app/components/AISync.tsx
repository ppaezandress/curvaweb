"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";

// Sincroniza el cronómetro del dock con el conector de IA:
// cuando Claude Code/Desktop empieza a trabajar, tu tarea activa pasa sola a "IA"
// (visual, sin doble registro — el tiempo IA lo registra el conector en Notion);
// cuando la IA termina, retomas esa tarea a mano.
export function AISync() {
  const { currentUserId, active, startAI, switchTo } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const email = me?.email;

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);
  const fns = useRef({ startAI, switchTo });
  useEffect(() => { fns.current = { startAI, switchTo }; });

  const wasLive = useRef(false);
  const autoTask = useRef<string | null>(null);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const d = await fetch(`/api/timing/live?u=${encodeURIComponent(email)}`).then((r) => r.json());
        const liveNow = (d.active || []).length > 0;
        if (liveNow && !wasLive.current) {
          // La IA empezó → pasa tu tarea activa a modo IA (sin robarte el foco ni duplicar registro).
          const a = activeRef.current;
          if (a) { autoTask.current = a.taskId; fns.current.startAI(a.taskId, { autoResume: null, silent: true }); }
        } else if (!liveNow && wasLive.current) {
          // La IA terminó → retoma esa tarea a mano.
          const t = autoTask.current;
          if (t) { fns.current.switchTo(t); autoTask.current = null; }
        }
        wasLive.current = liveNow;
      } catch { /* */ }
    };
    tick();
    const id = setInterval(() => { if (!cancelled) tick(); }, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [email]);

  return null;
}
