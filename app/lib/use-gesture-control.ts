"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GestureRecognizer } from "@mediapipe/tasks-vision";
import { readGestures, MIN_SCORE, type Gesture } from "@/lib/gestures/recognizer";
import { createIntegrator, type IntegratorConfig } from "@/lib/gestures/integrator";
import { reportClientError } from "@/lib/report-error";
import { playDetected, startKeepAlive, stopKeepAlive } from "@/lib/gestures/sound";
import { isSoundOn, getSensitivity, SENSITIVITY, isBackgroundOn } from "@/lib/gesture-prefs";
import { createCameraLock } from "@/lib/gestures/camera-lock";
import { createMetronome, frameIntervalMs, type Metronome } from "@/lib/gestures/metronome";

// Motor del control por gestos. Todo ocurre DENTRO del navegador: se lee la cámara, se buscan
// las manos y se decide el comando. Ningún cuadro se guarda ni se envía a ningún lado.
//
// Cuidado con el rendimiento: esto corre mientras el cronómetro va, y la app ya se trabó una
// vez por re-renderizar cada segundo (regla 2 de AGENTS.md). Por eso el bucle vive en refs y
// solo llama a setState cuando cambia algo que de verdad se ve: el gesto candidato o un
// escalón del anillo de progreso. Nunca una vez por cuadro.

const MODEL_URL = "/mediapipe/gesture_recognizer.task";
const WASM_PATH = "/mediapipe/wasm";
const PROGRESS_STEPS = 12; // granularidad del anillo → máximo 12 renders por dwell
const NO_HAND_TIMEOUT_MS = 30 * 60_000; // media hora sin ver manos → se apaga sola
// Ahorro: si lleva un rato sin ver una mano, baja el ritmo de inferencia. La cámara sigue
// encendida (reaccionar rápido importa) pero deja de gastar batería mirando una silla vacía.
const IDLE_AFTER_MS = 20_000;

export type GestureStatus =
  | "off"
  | "starting"
  | "running"
  | "denied" // el navegador negó la cámara
  | "taken" // otra pestaña de la app se quedó la cámara
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
  /**
   * Diagnóstico, para la pantalla de práctica. Se lee bajo demanda (NO es estado de React) para
   * no provocar un render por cuadro. Sirve para responder la pregunta que costó una tarde:
   * ¿el reconocimiento sigue vivo cuando me cambio a otra app, y de dónde saca los cuadros?
   */
  getStats: () => { frames: number; lastFrameAt: number; source: "track" | "video" | "—"; hidden: boolean; received: number; pumping: boolean; rawBroken: boolean; quality: number; read: string | null; raw: string | null };
};

export function useGestureControl(opts: {
  enabled: boolean;
  onCommand: (g: Gesture) => void;
  stabilizer?: Partial<IntegratorConfig>;
}): GestureControlState {
  const { enabled } = opts;

  const [status, setStatus] = useState<GestureStatus>("off");
  // Contador de arranques. El efecto de la cámara depende de ESTO, no de `status`: si
  // dependiera del estado, el `setStatus("running")` que hace al final se re-dispararía a sí
  // mismo, el cleanup mataría el bombeo de cuadros recién creado y quitaría el detector de
  // cambio de pestaña. Justo el bug que dejaba los gestos muertos en segundo plano.
  const [startToken, setStartToken] = useState(0);
  const statusRef = useRef<GestureStatus>("off");
  useEffect(() => { statusRef.current = status; }, [status]);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Gesture | null>(null);
  const [progress, setProgress] = useState(0);
  const [cooling, setCooling] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const rafRef = useRef<number | null>(null);
  const stabRef = useRef(createIntegrator(opts.stabilizer ?? SENSITIVITY[getSensitivity()]));
  const lastFrameRef = useRef(0);
  const lastHandRef = useRef(0);
  // Lo pintado ahora mismo, para no llamar a setState con el mismo valor.
  const shownRef = useRef<{ candidate: Gesture | null; step: number; cooling: boolean }>({
    candidate: null, step: 0, cooling: false,
  });
  // El callback se lee por ref: si entrara en las deps del efecto, cambiaría de identidad en
  // cada render del padre y reiniciaría la cámara constantemente (regla 1 de AGENTS.md).
  const lockRef = useRef<ReturnType<typeof createCameraLock> | null>(null);
  const metroRef = useRef<Metronome | null>(null);
  const hiddenRef = useRef(false);
  // Último cuadro llegado del track de la cámara (ver startFramePump) y su lector.
  const frameRef = useRef<VideoFrame | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<VideoFrame> | null>(null);
  // true cuando el reloj lo lleva la cámara (y no los temporizadores del navegador).
  const pumpingRef = useRef(false);
  // Si el reconocedor rechaza los cuadros crudos de la cámara, se deja de intentar.
  const rawFramesBrokenRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const statsRef = useRef({ frames: 0, lastFrameAt: 0, source: "—" as "track" | "video" | "—", received: 0, pumping: false, rawBroken: false, quality: 0, read: null as string | null, raw: null as string | null });
  const onCommandRef = useRef(opts.onCommand);
  useEffect(() => { onCommandRef.current = opts.onCommand; }, [opts.onCommand]);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    metroRef.current?.stop();
    metroRef.current = null;
    stopKeepAlive();
    // Un VideoFrame sin cerrar agota el pool del navegador y deja la cámara colgada.
    try { void readerRef.current?.cancel(); } catch { /* ya estaba cerrado */ }
    readerRef.current = null;
    frameRef.current?.close();
    frameRef.current = null;
    pumpingRef.current = false;
    rawFramesBrokenRef.current = false;
    statsRef.current = { frames: 0, lastFrameAt: 0, source: "—", received: 0, pumping: false, rawBroken: false, quality: 0, read: null, raw: null };
    streamRef.current?.getTracks().forEach((t) => t.stop()); // apaga la luz de la cámara
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    recognizerRef.current?.close();
    recognizerRef.current = null;
    stabRef.current.reset();
    lockRef.current?.release();
    lockRef.current = null;
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
    setStartToken((t) => t + 1);
  }, []);

  // Encendido/apagado. Solo depende de `status` y `enabled`: nada de callbacks en las deps.
  useEffect(() => {
    // Apagar la cámara ES sincronizar con un sistema externo (hardware): el aviso del linter
    // sobre setState en efectos no aplica a este caso, y dejar el stream vivo sería peor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!enabled) { if (statusRef.current !== "off") stop(); return; }
    if (startToken === 0) return; // todavía nadie ha pedido encender

    let cancelled = false;
    let cleanupVisibility: (() => void) | null = null;
    // Dónde falló: el motor de reconocimiento o la cámara. Cambia por completo qué se le
    // dice a la persona (y qué puede hacer al respecto).
    let stage: "engine" | "camera" = "engine";

    // La sensibilidad se lee AL ENCENDER: si la cambias en Ajustes, aplica al reactivar.
    stabRef.current = createIntegrator(opts.stabilizer ?? SENSITIVITY[getSensitivity()]);

    // Si otra pestaña reclama la cámara, esta se apaga sola y lo dice.
    lockRef.current?.release();
    lockRef.current = createCameraLock(() => {
      teardown();
      setStatus("taken");
      setError("Los gestos se movieron a la otra pestaña de la app que tienes abierta.");
    });

    (async () => {
      try {
        // Import dinámico: quien no use gestos no descarga MediaPipe.
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);

        // GPU cuando se puede, CPU cuando no. Sin esta caída, cualquier equipo o navegador
        // sin WebGL disponible revienta con "emscripten_webgl_create_context returned error"
        // y el control por gestos simplemente no arranca (visto en QA headless, y es el
        // riesgo real en Safari y en máquinas con la aceleración desactivada).
        // Modelo ENTRENADO de reconocimiento de gestos: clasifica formas de mano con su propia
        // confianza, en vez de darnos landmarks crudos para adivinar a mano. GPU con caída a
        // CPU (sin WebGL revienta con "emscripten_webgl_create_context"; pasa en Safari y con
        // la aceleración desactivada).
        const build = (delegate: "GPU" | "CPU") =>
          vision.GestureRecognizer.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: "VIDEO",
            numHands: 2, // hay dos manos en cuadro más seguido de lo que parece
          });
        const recognizer = await build("GPU").catch(() => build("CPU"));
        if (cancelled) { recognizer.close(); return; }
        recognizerRef.current = recognizer;
        stage = "camera";

        // Resolución baja a propósito: al modelo le sobra y cuesta mucho menos.
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

        // Cuadros DIRECTOS de la cámara, no del <video>.
        //
        // Este es el motivo por el que "en segundo plano no servía": al ocultarse la pestaña,
        // el navegador deja de refrescar el elemento <video>, así que el reconocedor seguía
        // leyendo la última imagen congelada — el bucle corría, pero miraba una foto vieja.
        // El track de la cámara sí sigue entregando cuadros, y MediaPipe acepta un VideoFrame
        // como entrada. Donde no exista esta API (Safari, Firefox) se sigue usando el <video>,
        // que funciona perfecto mientras la app esté a la vista.
        startFramePump(stream);

        lastHandRef.current = performance.now();
        // Avisa a las demás pestañas que aquí se está usando la cámara; ellas se apagan.
        lockRef.current?.claim();
        setStatus("running");

        metroRef.current?.stop();
        metroRef.current = createMetronome(() => tick());
        document.addEventListener("visibilitychange", applyVisibility);
        cleanupVisibility = () => document.removeEventListener("visibilitychange", applyVisibility);
        applyVisibility();
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

    // LA CÁMARA ES EL RELOJ.
    //
    // Aquí está la clave de que esto funcione con la pestaña en segundo plano. Un navegador
    // frena a una pestaña oculta por todos lados: congela requestAnimationFrame y limita los
    // temporizadores a uno por segundo — también los de un Web Worker. Con ese ritmo una seña
    // de 1.2 s no llega a confirmarse nunca, que es exactamente el síntoma que reportó Andrés.
    //
    // Lo que NO se frena es el flujo de la cámara: por eso en una videollamada tu cámara sigue
    // transmitiendo aunque te cambies de pestaña. Así que en vez de preguntarle la hora a un
    // temporizador, el reconocimiento cuelga de la llegada de cada cuadro. Sin temporizadores,
    // no hay nada que frenar.
    //
    // Cada VideoFrame hay que cerrarlo: si se acumulan, se agota el pool y la cámara se cuelga.
    function startFramePump(stream: MediaStream) {
      const Processor = (window as unknown as {
        MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };
      }).MediaStreamTrackProcessor;
      const track = stream.getVideoTracks()[0];
      if (!Processor || !track) return; // sin soporte: se cae a los temporizadores (ver abajo)

      try {
        const reader = new Processor({ track }).readable.getReader();
        readerRef.current = reader;
        pumpingRef.current = true;
        statsRef.current.pumping = true;
        (async () => {
          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            if (cancelled || !value) { value?.close(); break; }

            // Guarda siempre el cuadro más reciente y cierra el anterior.
            statsRef.current.received++;
            const prev = frameRef.current;
            frameRef.current = value;
            prev?.close();

            // Con la pestaña oculta los temporizadores están frenados, así que el pulso lo da
            // la cámara. Con la app a la vista manda requestAnimationFrame, que ya estaba
            // probado; `maybeAnalyze` comparte el limitador de ritmo, así que no se duplica
            // trabajo aunque los dos caminos estén vivos a la vez.
            if (hiddenRef.current) maybeAnalyze();
          }
        })().catch(() => {
          // Si el bombeo muere, el <video> y los temporizadores siguen cubriendo el primer
          // plano. NUNCA se deja al usuario sin ningún camino vivo.
          pumpingRef.current = false;
          frameRef.current?.close();
          frameRef.current = null;
        });
      } catch {
        /* sin bombeo: modo <video> */
      }
    }

    /**
     * Punto ÚNICO de análisis, con el limitador de ritmo compartido. Lo llaman los dos
     * caminos (la cámara y los temporizadores); el que llegue primero se lleva el turno.
     *
     * Prefiere el cuadro del flujo de la cámara — el único que sigue vivo en segundo plano —
     * y cae al <video> si ese camino falla. Si el reconocedor rechaza los cuadros crudos, deja
     * de intentarlo y se queda con el <video>: más vale funcionar solo en primer plano que no
     * funcionar en absoluto.
     */
    function maybeAnalyze() {
      const video = videoRef.current;
      if (!video || !recognizerRef.current) return;

      const now = performance.now();
      const idle = !hiddenRef.current && now - lastHandRef.current > IDLE_AFTER_MS;
      if (now - lastFrameRef.current < frameIntervalMs({ hidden: hiddenRef.current, idle })) return;

      const raw = frameRef.current;
      if (raw && !rawFramesBrokenRef.current) {
        lastFrameRef.current = now;
        // El reconocedor no traga un VideoFrame crudo, pero un lienzo sí. Se pinta el cuadro
        // en un canvas propio (320×240, un drawImage) y se le pasa eso. Ese rodeo es lo que
        // permite trabajar con la imagen del track — la única que sigue llegando cuando la
        // pestaña está en segundo plano.
        const canvas = ensureCanvas(raw.displayWidth || 320, raw.displayHeight || 240);
        const ok = canvas ? analyze(canvas as unknown as HTMLVideoElement, now, "track", raw) : false;
        if (ok) return;
        rawFramesBrokenRef.current = true;
        statsRef.current.rawBroken = true;
      }

      if (video.readyState < 2) return;
      lastFrameRef.current = now;
      analyze(video, now, "video");
    }

    // El bucle corre SIEMPRE, mires o no la app: el sentido de los gestos es poder cambiar de
    // tarea mientras estás en Figma o en la llamada. Mientras la pestaña está a la vista se
    // usa requestAnimationFrame (suave y barato); en cuanto se oculta, el navegador lo congela
    // y toma el relevo el metrónomo del worker, que sí sobrevive en segundo plano.
    function schedule() {
      if (hiddenRef.current) return; // en segundo plano manda el metrónomo
      rafRef.current = requestAnimationFrame(() => { tick(); schedule(); });
    }

    function applyVisibility() {
      const hidden = document.hidden;
      hiddenRef.current = hidden;
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

      if (hidden && isBackgroundOn()) {
        // Con la cámara de reloj no hace falta metrónomo (y sería frenado igual). Solo se usa
        // en el camino de respaldo del <video>.
        metroRef.current?.setInterval(pumpingRef.current ? 0 : frameIntervalMs({ hidden: true, idle: false }));
        // Mantiene vivo el audio: en segundo plano el tono es la ÚNICA señal de que te
        // reconoció, y de paso libra a la pestaña del frenado que aplica el navegador.
        startKeepAlive();
      } else {
        metroRef.current?.setInterval(0);
        stopKeepAlive();
        if (!hidden) schedule();
      }
    }

    /** Lienzo reutilizable donde se copia el cuadro de la cámara. Uno solo, no uno por cuadro. */
    function ensureCanvas(w: number, h: number): HTMLCanvasElement | null {
      let c = canvasRef.current;
      if (!c) {
        c = document.createElement("canvas");
        canvasRef.current = c;
        canvasCtxRef.current = c.getContext("2d", { willReadFrequently: false });
      }
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      return canvasCtxRef.current ? c : null;
    }

    /** Pulso de primer plano (requestAnimationFrame) y respaldo del metrónomo. */
    function tick() {
      maybeAnalyze();
    }

    /**
     * Analiza un cuadro y aplica el comando. Devuelve false si el reconocedor rechazó la
     * imagen, para que quien llama pueda intentar con otra fuente.
     */
    function analyze(source: HTMLVideoElement, now: number, from: "track" | "video", frame?: VideoFrame): boolean {
      const recognizer = recognizerRef.current;
      if (!recognizer) return false;

      if (frame) {
        const c2d = canvasCtxRef.current;
        if (!c2d) return false;
        try {
          c2d.drawImage(frame as unknown as CanvasImageSource, 0, 0);
        } catch {
          return false; // este navegador no deja pintar el cuadro: se usará el <video>
        }
      }

      let gesture: Gesture | null = null;
      let confidence = 0;
      try {
        statsRef.current.frames++;
        statsRef.current.lastFrameAt = Date.now();
        statsRef.current.source = from;

        // El modelo entrenado devuelve, POR MANO, la categoría más probable, su confianza y los
        // 21 puntos. Las formas robustas salen de la categoría; los puntos solo se usan para
        // contar el "tres dedos", que el modelo no clasifica (ver readGestures).
        const res = recognizer.recognizeForVideo(source, now);
        const gestures = res.gestures || [];
        const landmarks = (res.landmarks || []) as { x: number; y: number; z?: number }[][];
        // Una entrada por mano detectada, aunque el modelo no le asigne categoría (ahí el
        // "tres dedos" se resuelve por conteo de los puntos).
        const nHands = Math.max(gestures.length, landmarks.length);
        const perHand = Array.from({ length: nHands }, (_, i) => ({
          categoryName: gestures[i]?.[0]?.categoryName ?? "None",
          score: gestures[i]?.[0]?.score ?? 0,
          landmarks: landmarks[i],
        }));
        if (perHand.length) lastHandRef.current = now;

        const reading = readGestures(perHand);
        // La confianza la da el propio modelo; el umbral es un solo número.
        gesture = reading.confidence >= MIN_SCORE ? reading.gesture : null;
        confidence = reading.confidence;
        statsRef.current.quality = reading.confidence;
        statsRef.current.read = reading.gesture;
        statsRef.current.raw = reading.raw;
      } catch {
        return false; // el reconocedor rechazó esta imagen: quien llama probará con otra
      }

      // Cortesía: si llevas rato sin usarla, se apaga sola.
      if (now - lastHandRef.current > NO_HAND_TIMEOUT_MS) { stop(); return true; }

      const out = stabRef.current.feed(gesture, confidence, now);

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

      // El sonido de confirmación lo toca quien resuelve el comando: solo ahí se sabe si fue
      // un cambio de tarea, una pausa, un reanudar o algo que no aplicaba.
      if (out.fire) onCommandRef.current(out.fire);
      return true;
    }

    return () => { cancelled = true; cleanupVisibility?.(); };
  }, [startToken, enabled, stop, teardown]);

  // Al desmontar (cerrar sesión, salir de la app) la cámara se apaga sí o sí.
  useEffect(() => () => teardown(), [teardown]);

  const getStats = useCallback(
    () => ({ ...statsRef.current, hidden: hiddenRef.current }),
    [],
  );

  return { status, error, candidate, progress, cooling, videoRef, start, stop, getStats };
}
