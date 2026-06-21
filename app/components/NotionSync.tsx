"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";

// Sincroniza cada sesión de cronómetro (al detener) hacia la base
// "Registro de Tiempo" en Notion, vía /api/time-entries.
// Solo envía sesiones cerradas DESPUÉS de cargar la página (evita duplicar
// los registros locales que ya se sincronizaron en sesiones anteriores).
export function NotionSync() {
  const { entries } = useApp();
  const { taskById, memberById } = useData();
  const sessionStart = useRef<number>(Date.now());
  const sent = useRef<Set<string>>(new Set());

  useEffect(() => {
    entries.forEach((e) => {
      if (e.endedAt <= sessionStart.current) return; // de sesiones previas
      if (sent.current.has(e.id)) return;
      sent.current.add(e.id);
      const task = taskById[e.taskId];
      const user = memberById[e.userId];
      fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: e.taskId,
          taskName: task?.name || "",
          userName: user?.name || "",
          startedAt: e.startedAt,
          endedAt: e.endedAt,
          seconds: e.seconds,
          inactiveSeconds: e.inactiveSeconds || 0,
        }),
      }).catch(() => {});
    });
  }, [entries, taskById, memberById]);

  return null;
}
