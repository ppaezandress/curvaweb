"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";

// Sincroniza cada sesión de cronómetro (al detener) hacia la base "Registro de Tiempo" en
// Notion, vía /api/time-entries. Solo envía sesiones cerradas DESPUÉS de cargar la página
// (las rehidratadas ya se enviaron en su sesión y vienen marcadas synced). A diferencia de
// antes, CONFIRMA la escritura: si Notion falla (devuelve ok:false, incluso con status 200),
// NO marca el tramo como enviado y lo reintenta en el siguiente ciclo (no se pierde tiempo).
export function NotionSync() {
  const { entries, markEntryPosted, reconcileEntries } = useApp();
  const { taskById, taskTypeById, source, tasks } = useData();
  const sessionStart = useRef<number>(Date.now());
  const inFlight = useRef<Set<string>>(new Set());

  // La identidad (Persona) la fija el servidor con la sesión; el userName del body se ignora.
  useEffect(() => {
    // No sincronizar contra datos de prueba: los taskId de mock no existen en Notion y el
    // POST fallaría con una relación inválida (perdiendo el tramo).
    if (source !== "notion") return;
    entries.forEach((e) => {
      if (e.endedAt <= sessionStart.current) return; // sesiones previas (ya enviadas)
      if (e.posted || inFlight.current.has(e.id)) return;
      inFlight.current.add(e.id);
      const task = taskById[e.taskId];
      fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: e.taskId,
          taskName: task?.name || "",
          // Pilar heredado de la tarea (su "Tipo" en Notion) → medir el tiempo del cronómetro
          // por pilar igual que el registro manual (antes solo el manual lo mandaba).
          pilar: task?.typeId ? taskTypeById[task.typeId]?.label : undefined,
          startedAt: e.startedAt,
          endedAt: e.endedAt,
          seconds: e.seconds,
          inactiveSeconds: e.inactiveSeconds || 0,
          mode: e.mode || "manual",
        }),
      })
        .then((r) => r.json().catch(() => ({ ok: false })))
        .then((j: { ok?: boolean; id?: string }) => {
          if (j && j.ok !== false) {
            // Guardamos el baseline (rollup) de la tarea EN ESTE INSTANTE (antes de que el
            // reload lo incluya): la reconciliación espera a que crezca al menos este tramo
            // para dejar de contarlo localmente (evita el vaciado por lag de indexado).
            markEntryPosted(e.id, j.id, task?.baselineSeconds ?? 0);
          } else {
            inFlight.current.delete(e.id); // fallo real → reintenta al próximo ciclo
          }
        })
        .catch(() => {
          inFlight.current.delete(e.id); // red caída → reintenta
        });
    });
  }, [entries, taskById, taskTypeById, source, markEntryPosted]);

  // Cuando llega baseline fresco de Notion (cambia la lista de tareas tras un reload), los
  // tramos ya posteados pasan a contarse por el baseline y se dejan de sumar localmente.
  // Solo nos importa dispararlo cuando cambia el baseline (tasks) o el source, no en cada
  // recreación de reconcileEntries.
  useEffect(() => {
    if (source !== "notion") return;
    // Baseline por tarea (segundos) del reload recién llegado: la reconciliación solo marca
    // `synced` los tramos que el baseline ya absorbió (no antes → evita el vaciado del total).
    const baselineByTask: Record<string, number> = {};
    for (const t of tasks) baselineByTask[t.id] = t.baselineSeconds ?? 0;
    reconcileEntries(baselineByTask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, source]);

  return null;
}
