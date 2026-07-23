// Vocabulario de gestos, sobre el modelo ENTRENADO de MediaPipe.
//
// ── Por qué este archivo reemplazó a 790 líneas de geometría ────────────────────────────
//
// Antes se cargaba el detector de landmarks crudos y se reinventaba la clasificación a mano:
// contar dedos comparando distancias, con ~68 constantes a ojo. Eso es genuinamente frágil en
// una webcam —"3 vs 4 dedos vs palma" está al límite de lo que se puede distinguir así— y por
// eso cada arreglo fallaba frente a la cámara real.
//
// GestureRecognizer YA clasifica formas de mano entrenado con manos reales, y devuelve su
// propia confianza. Así que aquí no hay geometría: solo se traduce el nombre de categoría del
// modelo a nuestra seña, y su `score` ES la confianza. Un umbral en vez de 68 constantes.
//
// Las categorías del modelo: Open_Palm, Pointing_Up, Victory, Thumb_Up, ILoveYou, Closed_Fist,
// Thumb_Down, None. Se usan las cinco visualmente más distintas; el resto no significa nada.
import type { TimerCommand } from "@/lib/timer-commands";

export type Gesture = "uno" | "dos" | "tres" | "palma" | "pulgar";

export const GESTURE_LABEL: Record<Gesture, string> = {
  uno: "Índice arriba",
  dos: "Dos dedos",
  tres: "Cuernitos",
  palma: "Palma abierta",
  pulgar: "Pulgar arriba",
};

export const GESTURE_EMOJI: Record<Gesture, string> = {
  uno: "☝️", dos: "✌️", tres: "🤟", palma: "🖐️", pulgar: "👍",
};

// Nombre de categoría del modelo → nuestra seña. Lo que no está aquí (Closed_Fist, Thumb_Down,
// None) se ignora a propósito: son posturas ambiguas o de reposo.
const CATEGORY_TO_GESTURE: Record<string, Gesture> = {
  Open_Palm: "palma",
  Pointing_Up: "uno",
  Victory: "dos",
  ILoveYou: "tres",
  Thumb_Up: "pulgar",
};

/** Una detección del modelo para una mano: la categoría más probable y su confianza. */
export type ModelGesture = { categoryName: string; score: number };

/** Umbral de confianza del MODELO por debajo del cual el cuadro no cuenta. Un solo número. */
export const MIN_SCORE = 0.55;

export type Reading = {
  gesture: Gesture | null;
  /** Confianza 0..1, tal cual la reporta el modelo. */
  confidence: number;
  /** Categoría cruda del modelo, para el diagnóstico del laboratorio. */
  raw: string | null;
};

const EMPTY: Reading = { gesture: null, confidence: 0, raw: null };

/**
 * Lee la salida del modelo (una detección por mano) y decide la seña.
 *
 * Si hay varias manos, manda la de mayor confianza que además signifique algo. No hace falta
 * más: el modelo ya solo dispara una categoría cuando la mano forma claramente ese gesto.
 */
export function readGestures(perHand: ModelGesture[]): Reading {
  if (!perHand || perHand.length === 0) return EMPTY;

  // Manda la SEÑA VÁLIDA más confiable. Que una mano forme un puño con score altísimo no debe
  // ganarle a la otra que sí hace una seña — buscamos una orden, no la categoría más probable.
  let bestGesture: Reading | null = null;
  // Y por separado, la categoría cruda más confiable (aunque no signifique nada) para el
  // diagnóstico del laboratorio: así se ve qué está viendo el modelo.
  let bestRaw: ModelGesture = perHand[0];

  for (const g of perHand) {
    if (g.score > bestRaw.score) bestRaw = g;
    const gesture = CATEGORY_TO_GESTURE[g.categoryName] ?? null;
    if (gesture && (!bestGesture || g.score > bestGesture.confidence)) {
      bestGesture = { gesture, confidence: g.score, raw: g.categoryName };
    }
  }

  if (bestGesture) return bestGesture;
  return { gesture: null, confidence: bestRaw.score, raw: bestRaw.categoryName };
}

// ── Mando: gestos → comandos del cronómetro ──
// Palma abierta suelta el trabajo, pulgar arriba lo retoma. Los dedos, en medio, eligen tarea.
export const GESTURE_COMMAND: Record<Gesture, TimerCommand> = {
  uno: { kind: "switch", index: 0 },
  dos: { kind: "switch", index: 1 },
  tres: { kind: "switch", index: 2 },
  palma: { kind: "pause" },
  pulgar: { kind: "resume" },
};

export function commandForGesture(g: Gesture): TimerCommand {
  return GESTURE_COMMAND[g];
}
