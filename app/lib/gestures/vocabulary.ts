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

export type Gesture = "pulgar" | "uno" | "dos" | "tres" | "cuatro" | "palma";

export const GESTURE_LABEL: Record<Gesture, string> = {
  pulgar: "Pulgar arriba",
  uno: "1 dedo",
  dos: "2 dedos",
  tres: "3 dedos",
  cuatro: "4 dedos",
  palma: "Palma abierta",
};

export const GESTURE_EMOJI: Record<Gesture, string> = {
  pulgar: "👍", uno: "☝️", dos: "✌️", tres: "🤟", cuatro: "🖖", palma: "🖐️",
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

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Un dedo cuenta como extendido si su PUNTA está más lejos de la muñeca que su nudillo medio.
// Se usa distancia y no la coordenada `y` a propósito: comparar alturas solo funciona con la
// mano perfectamente vertical, y en la vida real la gente ladea la mano.
//
// Hay DOS umbrales con una zona muerta en medio. Con un solo umbral, un dedo a medio estirar
// oscila entre abierto y cerrado de un cuadro a otro, y el gesto parpadea entre 3 y 4 — que es
// justo el error que se reportó. Si un dedo cae en la zona dudosa, el cuadro entero se
// descarta: es preferible tardar un cuadro más que ejecutar el comando equivocado.
const OPEN_RATIO = 1.16; // claramente estirado
const CLOSED_RATIO = 1.02; // claramente recogido
const THUMB_OPEN = 1.12;
const THUMB_CLOSED = 1.0;

/** Estado de un dedo: `null` = no está claro. */
type Tri = boolean | null;

function readFinger(tipD: number, refD: number, open: number, closed: number): Tri {
  if (tipD > refD * open) return true;
  if (tipD < refD * closed) return false;
  return null; // zona muerta: mejor no opinar
}

export type FingerState = {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
};

/**
 * Qué tan clara es la lectura de los dedos (0..1).
 *
 * No es lo mismo una mano con los dedos francamente estirados o francamente recogidos que una
 * a medio camino. Antes esto era un sí/no: o pasaba el umbral o se descartaba el cuadro. Medir
 * el margen permite algo más listo — aceptar rápido lo evidente y pedir más tiempo a lo dudoso.
 */
export function fingerClarity(lm: Landmark[]): number {
  if (!lm || lm.length < 21) return 0;
  const wrist = lm[WRIST];
  const margins: number[] = [];

  for (const f of LONG_FINGERS) {
    const ratio = dist(lm[f.tip], wrist) / Math.max(dist(lm[f.pip], wrist), 1e-6);
    margins.push(marginOf(ratio, CLOSED_RATIO, OPEN_RATIO));
  }
  const pinkyMcp = lm[PINKY_MCP];
  const thumbRatio = dist(lm[THUMB_TIP], pinkyMcp) / Math.max(dist(lm[THUMB_IP], pinkyMcp), 1e-6);
  margins.push(marginOf(thumbRatio, THUMB_CLOSED, THUMB_OPEN));

  // Manda el dedo MÁS dudoso: basta uno ambiguo para que el conteo pueda salir mal.
  return Math.min(...margins);
}

/** 1 = lejísimos de la zona dudosa · 0 = justo en medio de ella. */
function marginOf(ratio: number, closed: number, open: number): number {
  const mid = (closed + open) / 2;
  const half = (open - closed) / 2;
  if (half <= 0) return 1;
  return Math.min(1, Math.abs(ratio - mid) / half);
}

/** Lectura completa; `null` si algún dedo quedó en la zona dudosa. */
export function fingersUp(lm: Landmark[]): FingerState | null {
  if (!lm || lm.length < 21) return null;
  const wrist = lm[WRIST];

  const read: Record<string, Tri> = {};
  for (const f of LONG_FINGERS) {
    read[f.name] = readFinger(dist(lm[f.tip], wrist), dist(lm[f.pip], wrist), OPEN_RATIO, CLOSED_RATIO);
  }

  // El pulgar no se puede medir contra la muñeca (casi no cambia de distancia al doblarse):
  // se mide si la punta se aleja del nudillo del meñique, que es el eje del "pulgar abierto".
  // Funciona igual con mano izquierda o derecha, y de frente o de espaldas.
  const pinkyMcp = lm[PINKY_MCP];
  const thumb = readFinger(dist(lm[THUMB_TIP], pinkyMcp), dist(lm[THUMB_IP], pinkyMcp), THUMB_OPEN, THUMB_CLOSED);

  const all = [thumb, read.index, read.middle, read.ring, read.pinky];
  if (all.some((v) => v === null)) return null; // un dedo a medias invalida el cuadro

  return {
    thumb: thumb as boolean,
    index: read.index as boolean,
    middle: read.middle as boolean,
    ring: read.ring as boolean,
    pinky: read.pinky as boolean,
  };
}

/** Centro de la palma. Sirve para exigir que la mano esté quieta antes de hacer caso. */
export function handCenter(lm: Landmark[]): { x: number; y: number } {
  const p = [lm[WRIST], lm[5], lm[9], lm[13], lm[PINKY_MCP]];
  return {
    x: p.reduce((a, q) => a + q.x, 0) / p.length,
    y: p.reduce((a, q) => a + q.y, 0) / p.length,
  };
}

/** Tamaño aparente de la mano (0..1). Una mano diminuta suele ser de alguien al fondo. */
export function handScale(lm: Landmark[]): number {
  return dist(lm[WRIST], lm[9]);
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
  2: "dos",
  3: "tres",
  4: "cuatro",
  5: "palma",
};

function match(f: FingerState): Gesture | null {
  const n = countFingers(f);

  // El puño NO significa nada, a propósito. Cerrar la mano es la postura natural de una mano
  // en reposo — al bajarla, al tomar el mouse — así que usarlo como comando garantizaba
  // disparos accidentales. Que no signifique nada es lo que lo hace seguro.
  if (n === 0) return null;

  // Un solo dedo: importa CUÁL. El pulgar arriba es un gesto propio y universal ("sigue"),
  // mientras que cualquier otro dedo levantado es "la tarea 1".
  if (n === 1) return f.thumb ? "pulgar" : "uno";

  return BY_COUNT[n] ?? null;
}

/** Mano demasiado pequeña = lejos de la cámara: casi siempre alguien de fondo, no tú. */
const MIN_SCALE = 0.07;

/** Gesto de una mano detectada, o `null` si no reconoce nada fiable. */
export function gestureFrom(lm: Landmark[]): Gesture | null {
  if (!handFullyVisible(lm)) return null;
  if (handScale(lm) < MIN_SCALE) return null;
  const f = fingersUp(lm);
  return f ? match(f) : null;
}

// ── Mando: gestos ──
// Palma abierta suelta el trabajo, pulgar arriba lo retoma. Los dedos, en medio, eligen tarea.
export const GESTURE_COMMAND: Record<Gesture, TimerCommand> = {
  pulgar: { kind: "resume" },
  uno: { kind: "switch", index: 0 },
  dos: { kind: "switch", index: 1 },
  tres: { kind: "switch", index: 2 },
  cuatro: { kind: "switch", index: 3 },
  palma: { kind: "pause" },
};

export function commandForGesture(g: Gesture): TimerCommand {
  return GESTURE_COMMAND[g];
}
