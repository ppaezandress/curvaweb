// Vocabulario de gestos: convierte los 21 puntos que devuelve MediaPipe en uno de los cinco
// gestos que entiende la app. Función PURA — no sabe de cámaras ni de React, así que se prueba
// con puntos fijos (tests/unit/gestures.test.ts).
//
//   ☝️  uno       → tarea 1 del dock
//   ✌️  dos       → tarea 2
//   🤟  tres      → tarea 3
//   🖐️  palma     → pausar
//   🙌  dosPalmas → seguir con lo último
//
// El vocabulario es corto a propósito: cuantas menos señas y más separadas entre sí, menos se
// confunden. El puño, los cuatro dedos y el pulgar solo NO significan nada — se probaron y
// daban demasiados disparos accidentales. Para la 4ª tarea en adelante está el teclado (1-9).
import type { TimerCommand } from "@/lib/timer-commands";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/gestures/calibration";

export type Landmark = { x: number; y: number; z?: number };
export type Handedness = "Left" | "Right";

export type Gesture = "uno" | "dos" | "tres" | "palma" | "dosPalmas";

export const GESTURE_LABEL: Record<Gesture, string> = {
  uno: "1 dedo",
  dos: "2 dedos",
  tres: "3 dedos",
  palma: "Palma abierta",
  dosPalmas: "Las dos palmas",
};

export const GESTURE_EMOJI: Record<Gesture, string> = {
  uno: "☝️", dos: "✌️", tres: "🤟", palma: "🖐️", dosPalmas: "🙌",
};

// Índices de MediaPipe Hands: 0 muñeca · 1-4 pulgar · 5-8 índice · 9-12 medio · 13-16 anular ·
// 17-20 meñique. Para cada dedo largo: TIP (punta) y PIP (nudillo medio).
const WRIST = 0;
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
// Umbrales ACTIVOS. Arrancan en los de fábrica y los sustituye la calibración de cada quien
// (ver lib/gestures/calibration.ts). Vive en un módulo porque el reconocimiento corre en un
// bucle caliente: pasarlos por parámetro en cada llamada no aportaría nada.
let T: Thresholds = DEFAULT_THRESHOLDS;

/** Aplica los umbrales de esta persona. Sin argumento, vuelve a los de fábrica. */
export function applyThresholds(t?: Thresholds) {
  T = t ?? DEFAULT_THRESHOLDS;
}

export function currentThresholds(): Thresholds {
  return T;
}

// El pulgar se mide APARTE y de otra forma. Compararlo contra la muñeca como a los demás
// dedos casi no lo movía del umbral: al abrir la palma se quedaba en la zona dudosa y, como un
// dedo dudoso invalida el cuadro entero, la palma abierta casi nunca se reconocía.
//
// Lo que sí lo separa con claridad es cuánto se aleja del nudillo del índice, medido en
// tamaños de mano: recogido cruza sobre la palma y queda encima; abierto se va al lado.
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;

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
  const margins = LONG_FINGERS.map((f) => {
    const ratio = dist(lm[f.tip], wrist) / Math.max(dist(lm[f.pip], wrist), 1e-6);
    return marginOf(ratio, T.closedRatio, T.openRatio);
  });
  // Manda el dedo MÁS dudoso de los cuatro largos: basta uno ambiguo para que el conteo salga
  // mal. El pulgar va aparte (thumbClarity) porque es ambiguo casi siempre y, metido en esta
  // cuenta, hundía la nota de la palma abierta — que es justo la seña más usada.
  return Math.min(...margins);
}

/**
 * Claridad del pulgar, por separado.
 *
 * En una palma abierta real el pulgar queda casi siempre a medio camino entre "pegado" y
 * "abierto": es el dedo con menos recorrido y el que peor lee el modelo. Mezclarlo con los
 * demás hacía que la palma puntuara como dudosa aunque los cuatro dedos largos estuvieran
 * clarísimos, y entonces el reconocimiento avanzaba a media máquina o no avanzaba.
 */
export function thumbClarity(lm: Landmark[]): number {
  if (!lm || lm.length < 21) return 0;
  return marginOf(thumbSpread(lm), T.thumbNear, T.thumbFar);
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
    read[f.name] = readFinger(dist(lm[f.tip], wrist), dist(lm[f.pip], wrist), T.openRatio, T.closedRatio);
  }

  // El pulgar, con su propia medida (ver THUMB_FAR / THUMB_NEAR).
  const spread = thumbSpread(lm);
  let thumb: Tri = spread > T.thumbFar ? true : spread < T.thumbNear ? false : null;

  const longs = [read.index, read.middle, read.ring, read.pinky];
  if (longs.some((v) => v === null)) return null; // un dedo largo a medias invalida el cuadro

  // Desempate a favor de la PALMA. El pulgar es el dedo que peor se lee, y con los cuatro
  // dedos largos abiertos la intención es inequívoca: nadie enseña cuatro dedos abiertos
  // queriendo decir otra cosa. Para que cuente como "cuatro" el pulgar tiene que estar
  // claramente recogido; en la duda, es palma.
  if (thumb === null) {
    if (longs.every((v) => v === true)) thumb = true;
    else return null;
  }

  return {
    thumb: thumb as boolean,
    index: read.index as boolean,
    middle: read.middle as boolean,
    ring: read.ring as boolean,
    pinky: read.pinky as boolean,
  };
}

/**
 * Cuánto se aleja el pulgar del nudillo del índice, en tamaños de mano.
 * Recogido cruza sobre la palma (valor bajo); abierto se va al lado (valor alto).
 */
export function thumbSpread(lm: Landmark[]): number {
  const scale = Math.max(dist(lm[WRIST], lm[MIDDLE_MCP]), 1e-6);
  return dist(lm[THUMB_TIP], lm[INDEX_MCP]) / scale;
}

/** Medidas crudas de un cuadro. Es lo que consume la calibración. */
export function sampleOf(lm: Landmark[]): { fingers: number[]; thumb: number; scale: number } | null {
  if (!lm || lm.length < 21) return null;
  const wrist = lm[WRIST];
  return {
    fingers: LONG_FINGERS.map((f) => dist(lm[f.tip], wrist) / Math.max(dist(lm[f.pip], wrist), 1e-6)),
    thumb: thumbSpread(lm),
    scale: handScale(lm),
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

/**
 * ¿Se ve lo suficiente de la mano para decidir?
 *
 * Antes se exigía que los 21 puntos estuvieran dentro del cuadro, y eso chocaba de frente con
 * el otro requisito: acercar la mano a la cámara. La palma abierta ocupa mucho más espacio que
 * uno o dos dedos, así que al acercarla SIEMPRE se sale alguna punta — y la seña se descartaba
 * entera. Era la razón de que la pausa casi nunca entrara.
 *
 * Ahora se pide que esté completo lo que de verdad se usa para contar: la muñeca, los nudillos
 * y las puntas de los dedos. Que un nudillo intermedio roce el borde no invalida nada.
 */
const CORE_POINTS = [0, 1, 2, 5, 9, 13, 17]; // muñeca, base del pulgar y los cuatro nudillos
const TIP_POINTS = [4, 8, 12, 16, 20]; // las cinco puntas
/** Cuántas puntas pueden salirse del cuadro sin invalidar la lectura. */
const TIPS_ALLOWED_OUT = 1;

function inside(p: Landmark, margin: number): boolean {
  return p.x > margin && p.x < 1 - margin && p.y > margin && p.y < 1 - margin;
}

export function handFullyVisible(lm: Landmark[], margin = 0.01): boolean {
  if (!lm || lm.length < 21) return false;
  // El esqueleto de la palma sí tiene que verse entero: de ahí salen el tamaño y la orientación.
  if (!CORE_POINTS.every((i) => inside(lm[i], margin))) return false;
  // Y casi todas las puntas: se tolera que una roce el borde.
  const tipsOut = TIP_POINTS.filter((i) => !inside(lm[i], margin)).length;
  return tipsOut <= TIPS_ALLOWED_OUT;
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
  1: "uno",
  2: "dos",
  3: "tres",
  5: "palma",
};

// Ni el puño ni los cuatro dedos significan nada, a propósito:
//   · el PUÑO es la postura natural de una mano en reposo — al bajarla, al tomar el mouse —,
//     así que como comando garantizaba disparos accidentales;
//   · CUATRO dedos se confundía demasiado seguido con tres y con la palma, y dependía de leer
//     bien el pulgar, que es el dedo que peor se lee.
// Que no signifiquen nada es parte de lo que hace fiable al resto.
function match(f: FingerState): Gesture | null {
  return BY_COUNT[countFingers(f)] ?? null;
}

/** Mano demasiado pequeña = lejos de la cámara: casi siempre alguien de fondo, no tú. */
const MIN_SCALE = 0.07;

/**
 * Gesto a partir de TODAS las manos en cuadro.
 *
 * Las dos palmas abiertas a la vez son el gesto más seguro que hay: hace falta tener las dos
 * manos libres y presentadas al mismo tiempo, cosa que no pasa por accidente ni sosteniendo el
 * celular. Por eso se reserva para retomar el trabajo.
 */
export function gestureFromHands(hands: Landmark[][]): Gesture | null {
  const read = hands.map((h) => gestureFrom(h));
  if (read.filter((g) => g === "palma").length >= 2) return "dosPalmas";
  // Si no, manda la mano que se ve más grande (la que está más cerca de la cámara).
  let best = -1;
  let bestScale = 0;
  hands.forEach((h, i) => {
    if (h.length < 21) return;
    const sc = handScale(h);
    if (sc > bestScale) { bestScale = sc; best = i; }
  });
  return best >= 0 ? read[best] : null;
}

/** Gesto de una mano detectada, o `null` si no reconoce nada fiable. */
export function gestureFrom(lm: Landmark[]): Gesture | null {
  if (!handFullyVisible(lm)) return null;
  if (handScale(lm) < MIN_SCALE) return null;
  const f = fingersUp(lm);
  return f ? match(f) : null;
}

// ── Mando: gestos ──
// Una palma suelta el trabajo, las dos palmas lo retoman. Los dedos, en medio, eligen tarea.
export const GESTURE_COMMAND: Record<Gesture, TimerCommand> = {
  uno: { kind: "switch", index: 0 },
  dos: { kind: "switch", index: 1 },
  tres: { kind: "switch", index: 2 },
  palma: { kind: "pause" },
  dosPalmas: { kind: "resume" },
};

export function commandForGesture(g: Gesture): TimerCommand {
  return GESTURE_COMMAND[g];
}
