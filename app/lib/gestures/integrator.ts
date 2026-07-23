// De cuadros sueltos a una orden: cuándo una seña sostenida se convierte en comando.
//
// ── Qué reemplaza y por qué ─────────────────────────────────────────────────────────────
//
// El estabilizador anterior tenía DOS mecanismos de acuerdo trabajando a la vez: una ventana de
// los últimos N cuadros con un porcentaje mínimo de coincidencia, y encima un tiempo de
// sostenido. Eran redundantes —los dos medían lo mismo— y traían cuatro constantes acopladas
// (tamaño de ventana, proporción de acuerdo, cuadros mínimos, tolerancia a fallos) que se
// comportaban distinto según los cuadros por segundo: en primer plano se analiza a 20/s y en
// segundo plano a 12/s, así que "tolerar 3 cuadros" significaba 150 ms o 250 ms según dónde
// estuvieras. Esa dependencia oculta del ritmo es de las cosas que más costó depurar.
//
// Aquí todo se mide en TIEMPO y se pondera por CONFIANZA:
//
//   · una seña impecable llena la barra en el tiempo que dice Ajustes;
//   · una dudosa avanza despacio, así que hay que insistir;
//   · una mala no avanza;
//   · y si aparece otra seña, el avance se PIERDE GRADUALMENTE en vez de borrarse de golpe —
//     un parpadeo del modelo ya no obliga a empezar de cero, que era la mitad del "a veces no
//     me lo toma".
import type { Gesture } from "@/lib/gestures/vocabulary";
import { TUNING, RELEASE_MS, SWITCH_DECAY } from "@/lib/gestures/tuning";

export type IntegratorConfig = {
  /** Cuánto hay que sostener una seña impecable para que cuente. */
  dwellMs: number;
  /** Silencio tras ejecutar, antes de aceptar nada nuevo. */
  cooldownMs: number;
  /** Tiempo seguido sin seña que hay que dejar entre un comando y el siguiente. */
  releaseMs: number;
};

export const DEFAULT_INTEGRATOR: IntegratorConfig = {
  dwellMs: 800,
  cooldownMs: 1600,
  releaseMs: RELEASE_MS,
};

export type IntegratorOutput = {
  /** Seña que se está sosteniendo ahora (para pintar el HUD). */
  candidate: Gesture | null;
  /** 0..1 — cuánto lleva de la barra. */
  progress: number;
  /** Se llenó: ejecuta ESTE comando. Aparece en un solo cuadro. */
  fire: Gesture | null;
  /** En silencio tras ejecutar, o esperando a que retires la mano. */
  cooling: boolean;
};

export type Integrator = {
  feed: (gesture: Gesture | null, confidence: number, tMs: number) => IntegratorOutput;
  reset: () => void;
};

const IDLE: IntegratorOutput = { candidate: null, progress: 0, fire: null, cooling: false };

/** Cuánto avanza un cuadro según su confianza: 0 si es mala, 1 si es impecable. */
export function weightOf(confidence: number): number {
  const { minConfidence, goodConfidence } = TUNING;
  if (confidence < minConfidence) return 0;
  if (confidence >= goodConfidence) return 1;
  // Entre el mínimo y "impecable" sube de 0.3 a 1: la evidencia regular sirve, pero cuesta.
  return 0.3 + ((confidence - minConfidence) / (goodConfidence - minConfidence)) * 0.7;
}

export function createIntegrator(cfg: Partial<IntegratorConfig> = {}): Integrator {
  const c = { ...DEFAULT_INTEGRATOR, ...cfg };

  let candidate: Gesture | null = null;
  let progress = 0;
  let lastT = 0;
  let cooldownUntil = 0;
  // Tras ejecutar hay que retirar la mano: se mide desde cuándo no se ve ninguna seña.
  let awaitingRelease = false;
  let clearSince = 0;

  const reset = () => {
    candidate = null;
    progress = 0;
    lastT = 0;
    cooldownUntil = 0;
    awaitingRelease = false;
    clearSince = 0;
  };

  const feed = (gesture: Gesture | null, confidence: number, tMs: number): IntegratorOutput => {
    const dt = lastT ? Math.max(0, Math.min(tMs - lastT, 500)) : 0; // un salto largo no cuenta
    lastT = tMs;

    // Retirar la mano: cualquier seña reinicia la cuenta.
    if (gesture === null) {
      if (!clearSince) clearSince = tMs;
      if (awaitingRelease && tMs - clearSince >= c.releaseMs) awaitingRelease = false;
    } else {
      clearSince = 0;
    }

    if (tMs < cooldownUntil || awaitingRelease) {
      candidate = null;
      progress = 0;
      return { ...IDLE, cooling: true };
    }

    const weight = weightOf(confidence);

    // Sin seña utilizable: el avance se desvanece en vez de borrarse.
    if (!gesture || weight === 0) {
      progress = Math.max(0, progress - (dt / c.dwellMs) * SWITCH_DECAY);
      if (progress === 0) candidate = null;
      return { candidate, progress, fire: null, cooling: false };
    }

    // Otra seña distinta: se descuenta primero: si el avance llega a cero, toma el relevo. Un
    // parpadeo del modelo cuesta un poco de barra, no volver a empezar.
    if (candidate && gesture !== candidate) {
      progress -= (dt / c.dwellMs) * SWITCH_DECAY;
      if (progress > 0) return { candidate, progress, fire: null, cooling: false };
      progress = 0;
    }

    candidate = gesture;
    progress = Math.min(1, progress + (dt / c.dwellMs) * weight);
    if (progress < 1) return { candidate, progress, fire: null, cooling: false };

    // Ejecuta.
    cooldownUntil = tMs + c.cooldownMs;
    awaitingRelease = true;
    clearSince = 0;
    const fired = candidate;
    candidate = null;
    progress = 0;
    return { candidate: null, progress: 1, fire: fired, cooling: true };
  };

  return { feed, reset };
}
