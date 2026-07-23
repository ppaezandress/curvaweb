// Vocabulario de gestos: convierte los 21 puntos que devuelve MediaPipe en uno de los cinco
// gestos que entiende la app. Función PURA — no sabe de cámaras ni de React, así que se prueba
// con puntos fijos (tests/unit/gestures.test.ts).
//
//   ☝️  uno    → tarea 1 del dock
//   ✌️  dos    → tarea 2
//   🤟  tres   → tarea 3
//   🖖  cuatro → tarea 4
//   🖐️  palma  → pausar
//
// "Palma" y "cinco" son el mismo gesto físico, por eso los gestos llegan solo hasta la tarea 4.
// El teclado sigue cubriendo del 1 al 9.
import type { TimerCommand } from "@/lib/timer-commands";

export type Landmark = { x: number; y: number; z?: number };
export type Handedness = "Left" | "Right";

export type Gesture = "puno" | "uno" | "dos" | "tres" | "cuatro" | "palma";

export const GESTURE_LABEL: Record<Gesture, string> = {
  puno: "Puño",
  uno: "1 dedo",
  dos: "2 dedos",
  tres: "3 dedos",
  cuatro: "4 dedos",
  palma: "Palma abierta",
};

export const GESTURE_EMOJI: Record<Gesture, string> = {
  puno: "✊", uno: "☝️", dos: "✌️", tres: "🤟", cuatro: "🖖", palma: "🖐️",
};

// Índices de MediaPipe Hands: 0 muñeca · 1-4 pulgar · 5-8 índice · 9-12 medio · 13-16 anular ·
// 17-20 meñique. Para cada dedo largo: TIP (punta) y PIP (nudillo medio).
const WRIST = 0;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const PINKY_MCP = 17;
const LONG_FINGERS = [
  { name: "index", tip: 8, pip: 6 },
  { name: "middle", tip: 12, pip: 10 },
  { name: "ring", tip: 16, pip: 14 },
  { name: "pinky", tip: 20, pip: 18 },
] as const;

export type FingerState = {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
};

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Un dedo cuenta como extendido si su PUNTA está más lejos de la muñeca que su nudillo medio.
// Se usa distancia y no la coordenada `y` a propósito: comparar alturas solo funciona con la
// mano perfectamente vertical, y en la vida real la gente ladea la mano.
const EXTENDED_RATIO = 1.12;

export function fingersUp(lm: Landmark[]): FingerState | null {
  if (!lm || lm.length < 21) return null;
  const wrist = lm[WRIST];

  const state: Record<string, boolean> = {};
  for (const f of LONG_FINGERS) {
    state[f.name] = dist(lm[f.tip], wrist) > dist(lm[f.pip], wrist) * EXTENDED_RATIO;
  }

  // El pulgar no se puede medir contra la muñeca (casi no cambia de distancia al doblarse):
  // se mide si la punta se aleja del nudillo del meñique, que es el eje del "pulgar abierto".
  // Funciona igual con mano izquierda o derecha, y de frente o de espaldas.
  const pinkyMcp = lm[PINKY_MCP];
  const thumb = dist(lm[THUMB_TIP], pinkyMcp) > dist(lm[THUMB_IP], pinkyMcp) * 1.08;

  return {
    thumb,
    index: state.index,
    middle: state.middle,
    ring: state.ring,
    pinky: state.pinky,
  };
}

// ¿Está la mano entera dentro del cuadro? Una mano cortada por el borde da conteos falsos
// (los dedos que se salen "desaparecen"), así que mejor no adivinar.
export function handFullyVisible(lm: Landmark[], margin = 0.02): boolean {
  if (!lm || lm.length < 21) return false;
  return lm.every((p) => p.x > margin && p.x < 1 - margin && p.y > margin && p.y < 1 - margin);
}

// Cuenta CUÁNTOS dedos hay levantados, sin importar cuáles.
//
// La primera versión exigía combinaciones exactas (el 3 tenía que ser índice+medio+anular) y
// falló con el primer usuario real: en México el 3 se hace con pulgar+índice+medio. Pedirle a
// alguien que cuente "como la app quiere" es pedirle lo imposible — cada quien cuenta como
// aprendió, y las dos formas son igual de válidas. Contar la cantidad las acepta todas.
export function countFingers(f: FingerState): number {
  return [f.thumb, f.index, f.middle, f.ring, f.pinky].filter(Boolean).length;
}

const BY_COUNT: Record<number, Gesture> = {
  0: "puno",
  1: "uno",
  2: "dos",
  3: "tres",
  4: "cuatro",
  5: "palma",
};

function match(f: FingerState): Gesture | null {
  return BY_COUNT[countFingers(f)] ?? null;
}

/** Gesto de una mano detectada, o `null` si no reconoce nada fiable. */
export function gestureFrom(lm: Landmark[]): Gesture | null {
  if (!handFullyVisible(lm)) return null;
  const f = fingersUp(lm);
  return f ? match(f) : null;
}

// ── Mando: gestos ──
// Mano abierta suelta el trabajo, mano cerrada lo vuelve a agarrar. Los dedos, en medio,
// eligen tarea.
export const GESTURE_COMMAND: Record<Gesture, TimerCommand> = {
  puno: { kind: "resume" },
  uno: { kind: "switch", index: 0 },
  dos: { kind: "switch", index: 1 },
  tres: { kind: "switch", index: 2 },
  cuatro: { kind: "switch", index: 3 },
  palma: { kind: "pause" },
};

export function commandForGesture(g: Gesture): TimerCommand {
  return GESTURE_COMMAND[g];
}
