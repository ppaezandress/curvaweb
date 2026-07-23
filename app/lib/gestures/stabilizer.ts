// Estabilizador de gestos. Es la pieza que decide que una mano SÍ es un comando, y existe por
// una sola razón: un falso positivo destruye la confianza en la función el primer día. Si
// saludas en una videollamada y se te para el cronómetro, apagas esto y no lo vuelves a
// encender.
//
// Tres defensas, en orden:
//   1. Acuerdo   — el gesto debe dominar los últimos N cuadros (un parpadeo del modelo no cuenta).
//   2. Dwell     — hay que SOSTENERLO ~1.2 s; mientras tanto se ve un anillo llenándose.
//   3. Cooldown  — tras disparar, 2 s de silencio Y hay que soltar la mano antes de repetir
//                  (si no, sostener el ☝️ dispararía el mismo comando en bucle).
//
// Puro y con el tiempo inyectado: se prueba entero sin cámara ni relojes falsos.
import type { Gesture } from "@/lib/gestures/vocabulary";
import { advanceRate } from "@/lib/gestures/quality";

export type StabilizerConfig = {
  dwellMs: number;
  cooldownMs: number;
  windowSize: number;
  /** Proporción de la ventana que debe coincidir para considerar el gesto estable (0..1). */
  minAgreeRatio: number;
  /** Cuadros mínimos antes de empezar a contar. Muy alto = el dwell se siente eterno. */
  minFrames: number;
  /** Cuántos cuadros seguidos puede fallar el candidato sin perder el progreso. */
  missTolerance: number;
  /**
   * Tras ejecutar, hay que RETIRAR la mano: se exige este tiempo seguido sin ninguna seña
   * antes de admitir el siguiente comando.
   *
   * Sin esto, una mano ocupada en otra cosa (manipular el celular, gesticular al hablar) suelta
   * ráfagas de comandos — cada cambio de postura contaba como una orden nueva. Obligar a que la
   * mano desaparezca entre una y otra convierte cada comando en un acto deliberado.
   */
  releaseMs: number;
};

export const DEFAULT_STABILIZER: StabilizerConfig = {
  dwellMs: 800,
  cooldownMs: 1600,
  windowSize: 12,
  // Subido de 0.8 a 0.85: al analizar más cuadros por segundo, exigir MÁS acuerdo ya no
  // cuesta tiempo — se gana precisión gratis.
  minAgreeRatio: 0.85,
  minFrames: 4,
  missTolerance: 3,
  releaseMs: 700,
};

export type StabilizerOutput = {
  /** Gesto que se está sosteniendo ahora mismo (para pintar el HUD), o null. */
  candidate: Gesture | null;
  /** 0..1 — qué tanto lleva del dwell. Alimenta el anillo de progreso. */
  progress: number;
  /** Se llenó el dwell: ejecuta ESTE comando. Solo aparece en un cuadro. */
  fire: Gesture | null;
  /** En silencio tras disparar (para atenuar el HUD). */
  cooling: boolean;
};

export type Stabilizer = {
  /**
   * @param quality 0..1 — qué tan buena es la evidencia de este cuadro (ver quality.ts).
   * Un cuadro impecable hace avanzar el progreso más rápido que el reloj; uno mediocre, más
   * lento. Por omisión 1 (para las pruebas que solo miden tiempo).
   */
  feed: (gesture: Gesture | null, tMs: number, quality?: number) => StabilizerOutput;
  reset: () => void;
};

const IDLE: StabilizerOutput = { candidate: null, progress: 0, fire: null, cooling: false };

export function createStabilizer(cfg: Partial<StabilizerConfig> = {}): Stabilizer {
  const c = { ...DEFAULT_STABILIZER, ...cfg };

  let window: (Gesture | null)[] = [];
  let candidate: Gesture | null = null;
  let cooldownUntil = 0;
  // Progreso acumulado hacia el disparo (0..1) y momento del último cuadro, para saber cuánto
  // tiempo real ha pasado entre uno y otro.
  let progressAcc = 0;
  let lastT = 0;
  // Cuadros seguidos en los que el candidato dejó de dominar. Se toleran unos pocos: el modelo
  // parpadea, y reiniciar el progreso a cero por un solo cuadro malo era la causa de que una
  // seña bien hecha "a veces no la tomara".
  let misses = 0;
  // Tras disparar hay que RETIRAR la mano: no basta con cambiar de seña. Se cuenta desde
  // cuándo no se ve ninguna seña; hasta cumplir `releaseMs` no se admite nada nuevo.
  let awaitingRelease = false;
  let clearSince = 0;

  const reset = () => {
    window = [];
    candidate = null;
    cooldownUntil = 0;
    progressAcc = 0;
    lastT = 0;
    misses = 0;
    awaitingRelease = false;
    clearSince = 0;
  };

  // Gesto que domina la ventana. El acuerdo se mide sobre los cuadros que HAY, no sobre el
  // tamaño máximo: si exigiéramos la ventana llena, el dwell real sería el que se ve en
  // pantalla más el tiempo de llenarla (1.8 s en vez de 1.2 s) y se sentiría lentísimo.
  const dominant = (): Gesture | null => {
    if (window.length < c.minFrames) return null;
    const counts = new Map<Gesture, number>();
    for (const g of window) if (g) counts.set(g, (counts.get(g) || 0) + 1);
    let best: Gesture | null = null;
    let bestN = 0;
    for (const [g, n] of counts) if (n > bestN) { best = g; bestN = n; }
    return best && bestN >= Math.ceil(window.length * c.minAgreeRatio) ? best : null;
  };

  const feed = (gesture: Gesture | null, tMs: number, quality = 1): StabilizerOutput => {
    const dt = lastT ? Math.max(0, tMs - lastT) : 0;
    lastT = tMs;
    window.push(gesture);
    if (window.length > c.windowSize) window.shift();

    const top = dominant();

    // Contabiliza cuánto lleva la escena SIN ninguna seña: es lo que libera el siguiente
    // comando. Basta con que aparezca cualquier seña para reiniciar la cuenta.
    if (gesture === null) {
      if (!clearSince) clearSince = tMs;
    } else {
      clearSince = 0;
    }
    if (awaitingRelease && clearSince && tMs - clearSince >= c.releaseMs) {
      awaitingRelease = false;
    }

    if (tMs < cooldownUntil) {
      candidate = null;
      progressAcc = 0;
      return { ...IDLE, cooling: true };
    }

    if (awaitingRelease) {
      candidate = null;
      progressAcc = 0;
      return { ...IDLE, cooling: true };
    }

    if (!top) {
      // Un tropiezo suelto no tira el progreso: se conserva unos cuadros por si el modelo solo
      // parpadeó. Pasado ese margen sí se abandona.
      if (candidate && misses < c.missTolerance) {
        misses++;
        return { candidate, progress: progressAcc, fire: null, cooling: false };
      }
      candidate = null;
      progressAcc = 0;
      return IDLE;
    }

    if (top !== candidate) {
      candidate = top;
      progressAcc = 0;
    }
    misses = 0;

    // El progreso avanza en proporción a la CALIDAD del cuadro: una seña impecable llena la
    // barra antes de que se cumpla el tiempo nominal; una dudosa tarda bastante más.
    progressAcc = Math.min(1, progressAcc + (dt / c.dwellMs) * advanceRate(quality));

    if (progressAcc < 1) return { candidate, progress: progressAcc, fire: null, cooling: false };

    // Disparo.
    cooldownUntil = tMs + c.cooldownMs;
    awaitingRelease = true;
    clearSince = 0;
    candidate = null;
    progressAcc = 0;
    window = [];
    return { candidate: null, progress: 1, fire: top, cooling: true };
  };

  return { feed, reset };
}
