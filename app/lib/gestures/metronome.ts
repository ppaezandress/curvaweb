"use client";

// Metrónomo para cuando la pestaña NO está a la vista.
//
// El problema: en cuanto cambias a Figma o al PDF, el navegador congela
// `requestAnimationFrame` y frena los temporizadores de la página a uno por segundo (y tras
// unos minutos, a uno por minuto). Con ese ritmo un gesto de 1.2 s jamás se completa: la
// función se moriría justo cuando más falta hace, que es cuando NO estás en la app.
//
// La salida es un Web Worker: los workers dedicados conservan sus temporizadores aunque la
// pestaña esté oculta. Este no hace nada más que dar el tic; la cámara y el reconocimiento
// siguen en el hilo principal (que es donde vive el <video>).
//
// El worker se crea desde un Blob para no arrastrar un archivo suelto que haya que servir y
// versionar aparte.

const WORKER_SRC = `
let id = null;
onmessage = (e) => {
  if (id !== null) { clearInterval(id); id = null; }
  const ms = e.data && e.data.ms;
  if (ms > 0) id = setInterval(() => postMessage(1), ms);
};
`;

export type Metronome = {
  /** Cambia el ritmo. 0 lo detiene. */
  setInterval: (ms: number) => void;
  stop: () => void;
  /** false si el navegador no soporta workers: hay que caer a temporizadores normales. */
  readonly available: boolean;
};

export function createMetronome(onTick: () => void): Metronome {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return { setInterval: () => {}, stop: () => {}, available: false };
  }

  let worker: Worker | null = null;
  let url: string | null = null;

  try {
    const blob = new Blob([WORKER_SRC], { type: "text/javascript" });
    url = URL.createObjectURL(blob);
    worker = new Worker(url);
    worker.onmessage = () => onTick();
  } catch {
    // Sin worker no se rompe nada: el bucle sigue con requestAnimationFrame y el control
    // simplemente se pausa mientras la pestaña esté oculta (el comportamiento anterior).
    return { setInterval: () => {}, stop: () => {}, available: false };
  }

  const stop = () => {
    try {
      worker?.postMessage({ ms: 0 });
      worker?.terminate();
    } catch {
      /* ya estaba muerto */
    }
    worker = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
  };

  return {
    setInterval: (ms: number) => {
      try {
        worker?.postMessage({ ms });
      } catch {
        /* el worker murió: el bucle normal sigue cubriendo la pestaña visible */
      }
    },
    stop,
    available: true,
  };
}

// ── Ritmo ───────────────────────────────────────────────────────────────────────────────
// Separado y puro para poder probarlo: de aquí depende que la función siga viva en segundo
// plano sin fundir la batería.
export const FPS_VISIBLE = 12; // suave y responsivo mientras miras la app
export const FPS_HIDDEN = 7; // suficiente para un dwell de 0.8 s, mucho más barato
export const FPS_IDLE = 3; // no hay ninguna mano a la vista

export function frameIntervalMs(state: { hidden: boolean; idle: boolean }): number {
  if (state.idle) return 1000 / FPS_IDLE;
  return 1000 / (state.hidden ? FPS_HIDDEN : FPS_VISIBLE);
}
