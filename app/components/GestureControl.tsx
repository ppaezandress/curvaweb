"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { useGestureControl } from "@/lib/use-gesture-control";
import { commandForGesture, type Gesture } from "@/lib/gestures/vocabulary";
import { resolveCommand, describeAction } from "@/lib/timer-commands";
import { GestureHud, GestureError } from "@/components/GestureHud";
import { PILOT } from "@/lib/pilot-flags";
import { toast } from "@/lib/toast";
import { GESTURE_ENABLED_EVENT, isGestureOptIn } from "@/lib/gesture-prefs";

// Host del control por gestos, montado en el layout. Si la persona no lo activó, este
// componente no hace absolutamente nada: no importa MediaPipe, no toca la cámara, no pide
// permisos. Encenderla siempre es una decisión explícita.
export function GestureControl() {
  const { openTasks, active, switchTo, pause } = useApp();
  const { taskById } = useData();
  const [optIn, setOptIn] = useState(false);

  // El opt-in vive en el dispositivo (no se sincroniza a ningún lado: nadie más tiene por
  // qué saber quién usa esto). Se escucha el evento para reaccionar al toggle de Ajustes.
  useEffect(() => {
    const read = () => setOptIn(isGestureOptIn());
    read();
    window.addEventListener(GESTURE_ENABLED_EVENT, read);
    return () => window.removeEventListener(GESTURE_ENABLED_EVENT, read);
  }, []);

  // Lo que el cronómetro tiene AHORA, leído por ref: el bucle de la cámara vive fuera de
  // React y necesita el estado fresco sin re-suscribirse (ni reiniciar la cámara) en cada
  // cambio del dock.
  // Lo ejecutado con la app en segundo plano, para contarlo al volver.
  const pendingRef = useRef<{ label: string; undo: () => void; count: number } | null>(null);
  const ctxRef = useRef({ openTasks, activeTaskId: active?.taskId ?? null });
  useEffect(() => { ctxRef.current = { openTasks, activeTaskId: active?.taskId ?? null }; }, [openTasks, active]);

  const nameOf = useCallback((taskId: string) => taskById[taskId]?.name, [taskById]);

  const onCommand = useCallback((g: Gesture) => {
    const ctx = ctxRef.current;
    const action = resolveCommand(commandForGesture(g), ctx);
    if (!action) return; // no hay esa tarea abierta, o ya estás en ella

    const previous = ctx.activeTaskId;
    if (action.kind === "pause") pause();
    else switchTo(action.taskId);

    const label = describeAction(action, nameOf(action.taskId));
    const undo = () => { if (previous) switchTo(previous); else pause(); };

    // Si la orden se ejecutó mientras estabas en otra app, el toast se consumiría sin que
    // nadie lo viera: se guarda y se te cuenta al volver. Nunca debe pasar que tu cronómetro
    // cambie y te enteres tres horas después mirando el historial.
    if (document.hidden) {
      pendingRef.current = { label, undo, count: (pendingRef.current?.count ?? 0) + 1 };
      return;
    }

    // Deshacer al alcance de la mano: si la cámara entendió mal, no hay que ir a arreglar el
    // historial. Limitación conocida: deshacer un cambio deja un tramo de unos segundos en la
    // tarea equivocada (es el tiempo que de verdad estuvo corriendo).
    toast(label, { tone: "info", action: { label: "Deshacer", onClick: undo } });
  }, [pause, switchTo, nameOf]);

  // Al volver a la app, cuenta lo que pasó mientras no mirabas.
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      const p = pendingRef.current;
      if (!p) return;
      pendingRef.current = null;
      const extra = p.count > 1 ? ` · y ${p.count - 1} ${p.count === 2 ? "cambio más" : "cambios más"}` : "";
      toast(`Mientras no estabas: ${p.label}${extra}`, {
        tone: "info",
        action: { label: "Deshacer", onClick: p.undo },
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Desestructurado: el linter de React trata el acceso a un objeto que contiene un ref como
  // lectura de ref durante el render.
  const { status, error, candidate, progress, cooling, videoRef, start, stop } =
    useGestureControl({ enabled: optIn, onCommand });

  // El HUD anuncia qué hará el gesto que estás sosteniendo, con el nombre real de la tarea.
  const hint = (() => {
    if (!candidate) return null;
    const action = resolveCommand(commandForGesture(candidate), {
      openTasks, activeTaskId: active?.taskId ?? null,
    });
    if (!action) {
      // Decir POR QUÉ no va a pasar nada: "sin tarea ahí" cuando pides una que no está
      // abierta, y "ya vas" cuando el gesto no aplica al estado actual.
      if (candidate === "puno") return active ? "Ya vas" : "Nada que reanudar";
      if (candidate === "palma") return "Nada corriendo";
      return "Sin tarea ahí";
    }
    if (action.kind === "pause") return "Pausar";
    return `${candidate === "puno" ? "Seguir · " : ""}${nameOf(action.taskId) || "Cambiar de tarea"}`;
  })();

  // Autoencendido tras el opt-in: la persona ya dijo que sí en Ajustes.
  useEffect(() => {
    // Sincronizar con un sistema externo (el hardware de la cámara) es justo el caso para el
    // que existe useEffect: al decir que sí en Ajustes se enciende, y al apagar el toggle se
    // apaga de verdad.
    if (optIn && status === "off") start();
    if (!optIn && status !== "off") stop();
  }, [optIn, status, start, stop]);

  if (!PILOT.gestures || !optIn) return null;

  return (
    <AnimatePresence>
      {(status === "running" || status === "starting") && (
        <GestureHud
          key="hud"
          candidate={candidate}
          progress={progress}
          cooling={cooling}
          hint={hint}
          videoRef={videoRef}
          onStop={stop}
        />
      )}
      {error && status !== "running" && (
        <GestureError key="err" message={error} onDismiss={stop} />
      )}
    </AnimatePresence>
  );
}
