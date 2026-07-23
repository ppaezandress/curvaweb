"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { gestureFrom, type Gesture, type Landmark } from "@/lib/gestures/vocabulary";
import { createStabilizer, type StabilizerConfig } from "@/lib/gestures/stabilizer";
import { reportClientError } from "@/lib/report-error";
import { isSoundOn, playConfirmed, playDetected } from "@/lib/gestures/sound";

// Motor del control por gestos. Todo ocurre DENTRO del navegador: se lee la cámara, se buscan
// las manos y se decide el comando. Ningún cuadro se guarda ni se envía a ningún lado.
//
// Cuidado con el rendimiento: esto corre mientras el cronómetro va, y la app ya se trabó una
// vez por re-renderizar cada segundo (regla 2 de AGENTS.md). Por eso el bucle vive en refs y
// solo llama a setState cuando cambia algo que de verdad se ve: el gesto candidato o un
// escalón del anillo de progreso. Nunca una vez por cuadro.

const MODEL_URL = "/mediapipe/hand_landmarker.task";
const WASM_PATH = "/mediapipe/wasm";
const TARGET_FPS = 12; // suficiente para gestos sostenidos; a 30 solo se gasta batería
const FRAME_MS = 1000 / TARGET_FPS;
const PROGRESS_STEPS = 12; // granularidad del anillo → máximo 12 renders por dwell
const NO_HAND_TIMEOUT_MS = 5 * 60_000; // sin ver manos 5 min → se apaga sola

export type GestureStatus =
  | "off"
  | "starting"
  | "running"
  | "denied" // el navegador negó la cámara
  | "unsupported"; // faltan los assets o el navegador no puede

export type GestureControlState = {
  status: GestureStatus;
  error: string | null;
  candidate: Gesture | null;
  progress: number;
  cooling: boolean;
  /** Para el preview del HUD. Se conecta a un <video> mudo; no se graba nada. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  start: () => void;
  stop: () => void;
};

export function useGestureControl(opts: {
  enabled: boolean;
  onCommand: (g: Gesture) => void;
  stabilizer?: Partial<StabilizerConfig>;
}): GestureControlState {
  const { enabled } = opts;

  const [status, setStatus] = useState<GestureStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Gesture | null>(null);
  const [progress, setProgress] = useState(0);
  const [cooling, setCooling] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const stabRef = useRef(createStabilizer(opts.stabilizer));
  const lastFrameRef = useRef(0);
  const lastHandRef = useRef(0);
  // Lo pintado ahora mismo, para no llamar a setState con el mismo valor.
  const shownRef = useRef<{ candidate: Gesture | null; step: number; cooling: boolean }>({
    candidate: null, step: 0, cooling: false,
  });
  // El callback se lee por ref: si entrara en las deps del efecto, cambiaría de identidad en
  // cada render del padre y reiniciaría la cámara constantemente (regla 1 de AGENTS.md).
  const onCommandRef = useRef(opts.onCommand);
  useEffect(() => { onCommandRef.current = opts.onCommand; }, [opts.onCommand]);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); // apaga la luz de la cámara
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    stabRef.current.reset();
    shownRef.current = { candidate: null, step: 0, cooling: false };
    setCandidate(null);
    setProgress(0);
    setCooling(false);
  }, []);

  const stop = useCallback(() => {
    teardown();
    setStatus("off");
  }, [teardown]);

  const start = useCallback(() => {
    setError(null);
    setStatus("starting");
  }, []);

  // Encendido/apagado. Solo depende de `status` y `enabled`: nada de callbacks en las deps.
  useEffect(() => {
    // Apagar la cámara ES sincronizar con un sistema externo (hardware): el aviso del linter
    // sobre setState en efectos no aplica a este caso, y dejar el stream vivo sería peor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!enabled && status !== "off") { stop(); return; }
    if (status !== "starting") return;

    let cancelled = false;
    // Dónde falló: el motor de reconocimiento o la cámara. Cambia por completo qué se le
    // dice a la persona (y qué puede hacer al respecto).
    let stage: "engine" | "camera" = "engine";

    (async () => {
      try {
        // Import dinámico: quien no use gestos no descarga MediaPipe.
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);

        // GPU cuando se puede, CPU cuando no. Sin esta caída, cualquier equipo o navegador
        // sin WebGL disponible revienta con "emscripten_webgl_create_context returned error"
        // y el control por gestos simplemente no arranca (visto en QA headless, y es el
        // riesgo real en Safari y en máquinas con la aceleración desactivada).
        const build = (delegate: "GPU" | "CPU") =>
          vision.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: "VIDEO",
            numHands: 1,
          });
        const landmarker = await build("GPU").catch(() => build("CPU"));
        if (cancelled) { landmarker.close(); return; }
        landmarkerRef.current = landmarker;
        stage = "camera";

        // Resolución baja a propósito: para contar dedos sobra, y cuesta mucho menos.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) throw new Error("sin elemento de video");
        video.srcObject = stream;
        await video.play();

        lastHandRef.current = performance.now();
        setStatus("running");
        loop();
      } catch (e) {
        if (cancelled) return;
        teardown();
        // Al usuario se le dice qué pasó y qué puede hacer; el detalle técnico se va a la
        // bitácora. Volcar el mensaje crudo de MediaPipe o del navegador ("Not supported")
        // no ayuda a nadie.
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("denied");
          setError("No diste permiso de cámara. Puedes activarlo en el candado de la barra de direcciones.");
        } else if (stage === "camera") {
          setStatus("unsupported");
          setError(
            name === "NotFoundError"
              ? "No encontré ninguna cámara conectada."
              : "No pude usar la cámara. Revisa que no la tenga tomada otra app (Zoom, Meet, Photo Booth).",
          );
          reportClientError("gesture-camera", e, { stage });
        } else {
          // Falla del motor de reconocimiento, casi siempre WebGL no disponible.
          setStatus("unsupported");
          setError("Tu navegador no pudo iniciar el reconocimiento de manos. Suele ser la aceleración por hardware desactivada; en Chrome está en Configuración → Sistema.");
          reportClientError("gesture-engine", e, { stage });
        }
      }
    })();

    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;

      // La pestaña en segundo plano no mira: ni inferencia ni batería.
      if (document.hidden) return;

      const now = performance.now();
      if (now - lastFrameRef.current < FRAME_MS) return;
      lastFrameRef.current = now;

      let gesture: Gesture | null = null;
      try {
        const res = landmarker.detectForVideo(video, now);
        const hand = res.landmarks?.[0] as Landmark[] | undefined;
        if (hand?.length) {
          lastHandRef.current = now;
          gesture = gestureFrom(hand);
        }
      } catch {
        return; // un cuadro suelto que falla no debe tumbar el bucle
      }

      // Cortesía: si llevas rato sin usarla, se apaga sola.
      if (now - lastHandRef.current > NO_HAND_TIMEOUT_MS) { stop(); return; }

      const out = stabRef.current.feed(gesture, now);

      // Aquí está la clave del rendimiento: setState SOLO si cambió lo que se ve.
      const step = Math.round(out.progress * PROGRESS_STEPS);
      const shown = shownRef.current;
      if (out.candidate !== shown.candidate) {
        // Avisa que SÍ está viendo la mano. Sin esta señal uno se queda haciendo señas al
        // aire sin saber si falla el gesto, la luz o la cámara.
        if (out.candidate && isSoundOn()) playDetected();
        shownRef.current.candidate = out.candidate;
        setCandidate(out.candidate);
      }
      if (step !== shown.step) { shownRef.current.step = step; setProgress(step / PROGRESS_STEPS); }
      if (out.cooling !== shown.cooling) { shownRef.current.cooling = out.cooling; setCooling(out.cooling); }

      if (out.fire) {
        if (isSoundOn()) playConfirmed();
        onCommandRef.current(out.fire);
      }
    }

    return () => { cancelled = true; };
  }, [status, enabled, stop, teardown]);

  // Al desmontar (cerrar sesión, salir de la app) la cámara se apaga sí o sí.
  useEffect(() => () => teardown(), [teardown]);

  return { status, error, candidate, progress, cooling, videoRef, start, stop };
}
