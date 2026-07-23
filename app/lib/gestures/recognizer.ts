// Vocabulario de gestos, sobre el modelo ENTRENADO de MediaPipe — con UNA excepción medida.
//
// ── El enfoque ──────────────────────────────────────────────────────────────────────────
//
// La versión que reinventaba TODA la clasificación a mano (contar 1/2/3/4/5 dedos con ~68
// constantes) era frágil y falló repetidas veces. GestureRecognizer clasifica formas de mano
// entrenado con manos reales y da su propia confianza, así que las señas robustas salen de él:
//   Open_Palm → palma · Pointing_Up → uno · Victory → dos · Thumb_Up → pulgar
//
// PERO el modelo no tiene una categoría de "tres dedos", y Andrés quiere hacer el 3 con la
// mano. La solución no es volver al enredo anterior: es contar dedos SOLO para el 3, y solo
// cuando el modelo no reconoció ninguna de sus formas. Un gesto por conteo, no cinco. El resto
// (palma, dos, etc.) lo sigue haciendo el modelo, que es lo que da la robustez.
//
// El GestureRecognizer devuelve también los 21 puntos de la mano, así que el conteo no cuesta
// una segunda inferencia: se leen del mismo resultado.
import type { TimerCommand } from "@/lib/timer-commands";

export type Gesture = "uno" | "dos" | "tres" | "palma" | "pulgar";

export const GESTURE_LABEL: Record<Gesture, string> = {
  uno: "Índice arriba",
  dos: "Dos dedos",
  tres: "Tres dedos",
  palma: "Palma abierta",
  pulgar: "Pulgar arriba",
};

export const GESTURE_EMOJI: Record<Gesture, string> = {
  uno: "☝️", dos: "✌️", tres: "3️⃣", palma: "🖐️", pulgar: "👍",
};

// Nombre de categoría del modelo → nuestra seña. Lo que no está aquí (Closed_Fist, Thumb_Down,
// ILoveYou, None) se ignora: o son posturas de reposo, o el "tres dedos" lo resolvemos por conteo.
const CATEGORY_TO_GESTURE: Record<string, Gesture> = {
  Open_Palm: "palma",
  Pointing_Up: "uno",
  Victory: "dos",
  Thumb_Up: "pulgar",
};

export type Landmark = { x: number; y: number; z?: number };

/** Detección del modelo para una mano: categoría + confianza + los 21 puntos (para contar el 3). */
export type ModelGesture = { categoryName: string; score: number; landmarks?: Landmark[] };

/** Umbral de confianza por debajo del cual el cuadro no cuenta. Un solo número. */
export const MIN_SCORE = 0.55;

export type Reading = {
  gesture: Gesture | null;
  /** Confianza 0..1. Del modelo para sus formas; fija razonable para el "tres" por conteo. */
  confidence: number;
  /** Categoría cruda del modelo (o "3 dedos"), para el diagnóstico del laboratorio. */
  raw: string | null;
};

const EMPTY: Reading = { gesture: null, confidence: 0, raw: null };

// ── Conteo de dedos, SOLO para el "tres" ────────────────────────────────────────────────
// Índices MediaPipe: 0 muñeca · 4 punta pulgar, 3 IP · 8/6 índice · 12/10 medio · 16/14 anular
// · 20/18 meñique · 17 nudillo meñique.
const WRIST = 0, THUMB_TIP = 4, THUMB_IP = 3, PINKY_MCP = 17;
const LONG = [[8, 6], [12, 10], [16, 14], [20, 18]] as const; // [tip, pip] índice→meñique

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Cuántos dedos están claramente extendidos (0..5). Un dedo largo cuenta si su punta está más
 * lejos de la muñeca que su nudillo medio (robusto a que ladees la mano, a diferencia de mirar
 * la altura cruda). El pulgar, si su punta se aleja del nudillo del meñique.
 */
export function countFingers(lm: Landmark[]): number {
  if (!lm || lm.length < 21) return -1;
  const wrist = lm[WRIST];
  let n = 0;
  for (const [tip, pip] of LONG) {
    if (dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.12) n++;
  }
  const pinkyMcp = lm[PINKY_MCP];
  if (dist(lm[THUMB_TIP], pinkyMcp) > dist(lm[THUMB_IP], pinkyMcp) * 1.1) n++;
  return n;
}

/** Confianza que se le da al "tres" por conteo: fija y por encima del umbral. */
const THREE_CONFIDENCE = 0.7;

/**
 * Lee la salida del modelo y decide la seña.
 *
 * Prioridad: (1) una forma que el modelo reconozca (robusto); (2) si no, y hay exactamente
 * TRES dedos extendidos, es la tarea 3. El orden importa: si el modelo ya vio una palma o un
 * dos, gana esa; el conteo solo entra cuando el modelo no reconoció nada suyo.
 */
export function readGestures(perHand: ModelGesture[]): Reading {
  if (!perHand || perHand.length === 0) return EMPTY;

  let bestGesture: Reading | null = null;
  let bestThree: Reading | null = null;
  let bestRaw: ModelGesture = perHand[0];

  for (const g of perHand) {
    if (g.score > bestRaw.score) bestRaw = g;

    const gesture = CATEGORY_TO_GESTURE[g.categoryName] ?? null;
    if (gesture && (!bestGesture || g.score > bestGesture.confidence)) {
      bestGesture = { gesture, confidence: g.score, raw: g.categoryName };
    }

    // "Tres dedos": solo si el modelo NO reconoció una de SUS formas para esta mano (si dijo
    // Victory o Open_Palm con confianza, esa manda y no contamos).
    if (!gesture || g.score < MIN_SCORE) {
      if (g.landmarks && countFingers(g.landmarks) === 3) {
        bestThree = { gesture: "tres", confidence: THREE_CONFIDENCE, raw: "3 dedos" };
      }
    }
  }

  if (bestGesture) return bestGesture;
  if (bestThree) return bestThree;
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
