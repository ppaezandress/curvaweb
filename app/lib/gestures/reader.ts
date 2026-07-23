// Lectura de un cuadro: qué seña hay y qué tan buena es la evidencia.
//
// ── Por qué se rediseñó ─────────────────────────────────────────────────────────────────
//
// La versión anterior hacía pasar cada seña por OCHO puertas independientes (visible, escala
// mínima, escala presentada, dedos sin ambigüedad, orientación, calidad mínima, acuerdo de
// ventana, dwell). Cada puerta tenía sus propias constantes y podía rechazar en silencio con un
// `return null`. Eso produjo una racha de fallos en cadena, siempre del mismo tipo:
//
//   · "acerca la mano" chocaba con "que quepa entera" → la palma abierta no cabía nunca;
//   · "un dedo dudoso invalida el cuadro" chocaba con "el pulgar de una palma es dudoso";
//   · subir un umbral para frenar falsos positivos mataba señas buenas en otra puerta.
//
// Aquí se cambia el principio. Dos ideas:
//
// 1. UNA SOLA LECTURA, SIEMPRE EXPLICADA. Nunca se devuelve un `null` mudo: si no hay seña, hay
//    una razón con nombre, que se puede enseñar al usuario y usar para depurar.
//
// 2. FACTORES QUE SE MULTIPLICAN, NO PUERTAS QUE SE SUMAN. Estar presentada, de frente, quieta
//    y con los dedos claros son condiciones que se necesitan TODAS. Con una media ponderada,
//    dos factores altos compensaban uno inaceptable (así se colaba el celular en la mano). Al
//    multiplicarlas, un factor malo hunde el resultado por sí solo, que es justo lo que debe
//    pasar, y a la vez ninguna condición necesita un corte binario que rechace de golpe.
//
// El pulgar queda fuera del cálculo de confianza a propósito: es el dedo con menos recorrido y
// el que peor lee el modelo, y meterlo hundía la palma abierta, que es la seña más usada.
import {
  fingersUp, thumbSpread, handScale, handCenter, fingerClarity,
  palmFacingRatio, palmFlatness, coreVisible, tipsOutOfFrame, countFingers,
  currentThresholds, type Gesture, type Landmark,
} from "@/lib/gestures/vocabulary";
import { TUNING } from "@/lib/gestures/tuning";

/** Por qué no hay una seña utilizable. Se enseña al usuario y sirve para depurar. */
export type Reason =
  | "sin-mano"
  | "fuera-de-cuadro"
  | "lejos"
  | "de-canto"
  | "en-movimiento"
  | "dedos-ambiguos"
  | "sin-significado";

export type Reading = {
  /** La seña, si la evidencia da para nombrarla. */
  gesture: Gesture | null;
  /** 0..1 — qué tan buena es la evidencia de este cuadro. */
  confidence: number;
  /** Qué falla (o qué falla MÁS). `null` cuando la lectura es buena. */
  reason: Reason | null;
  /** Desglose, para diagnóstico y para decirle a la persona qué corregir. */
  factors: { clarity: number; presence: number; facing: number; steadiness: number };
  /** Centro de la mano atendida, para medir su velocidad en el siguiente cuadro. */
  center: { x: number; y: number } | null;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Interpola 0..1 entre dos puntos, sin saltos. */
function ramp(v: number, floor: number, full: number): number {
  if (full <= floor) return v >= full ? 1 : 0;
  return clamp01((v - floor) / (full - floor));
}

const EMPTY: Reading = {
  gesture: null, confidence: 0, reason: "sin-mano",
  factors: { clarity: 0, presence: 0, facing: 0, steadiness: 0 }, center: null,
};

export type ReadInput = {
  hands: Landmark[][];
  /** Velocidad del centro de la mano (pantallas por segundo), del cuadro anterior. */
  speed: number;
};

export function readFrame({ hands, speed }: ReadInput): Reading {
  const usable = hands.filter((h) => h && h.length >= 21);
  if (usable.length === 0) return EMPTY;

  // Las dos palmas abiertas a la vez son un gesto propio: exige tener ambas manos libres y
  // presentadas, cosa que no ocurre por accidente. Se comprueba antes de elegir mano.
  if (usable.length >= 2) {
    const both = usable.map((h) => readOne(h, speed));
    const palms = both.filter((r) => r.gesture === "palma");
    if (palms.length >= 2) {
      // La confianza es la del PEOR de los dos: si una mano se ve mal, la seña no es fiable.
      const worst = palms.reduce((a, b) => (b.confidence < a.confidence ? b : a));
      return { ...worst, gesture: "dosPalmas" };
    }
  }

  // Si no, manda la mano que se ve más grande: la que estás presentando a la cámara.
  let best = usable[0];
  for (const h of usable) if (handScale(h) > handScale(best)) best = h;
  return readOne(best, speed);
}

function readOne(lm: Landmark[], speed: number): Reading {
  const center = handCenter(lm);
  const t = currentThresholds();

  // Único rechazo duro que queda, y es físico: sin el esqueleto de la palma no hay geometría
  // que valga —ni tamaño, ni orientación, ni forma—, así que no hay nada que puntuar.
  if (!coreVisible(lm) || tipsOutOfFrame(lm) > TUNING.tipsAllowedOut) {
    return { ...EMPTY, reason: "fuera-de-cuadro", center };
  }

  // ── Factores, todos 0..1 y todos necesarios ──
  const presence = ramp(handScale(lm) / Math.max(t.minPresentScale, 1e-6), TUNING.presentFloor, 1);
  const facing = ramp(
    // Manda la proporción de la palma, que se puede medir siempre; la inclinación por
    // profundidad solo refuerza. Al 50/50 pesaba demasiado: cuando el modelo no da una
    // profundidad útil, esa mitad se queda en un valor neutro alto y tapaba una mano
    // claramente de canto —justo el caso de la mano apoyada en la cara—.
    0.65 * palmFacingRatio(lm) + 0.35 * palmFlatness(lm),
    TUNING.facingFloor, TUNING.facingFull,
  );
  const steadiness = clamp01(1 - speed / TUNING.moveLimit);
  const clarity = fingerClarity(lm); // solo los cuatro dedos largos; el pulgar va aparte

  const confidence = clamp01(clarity * presence * facing * steadiness);
  const factors = { clarity, presence, facing, steadiness };

  // ── Qué seña es ──
  const fingers = fingersUp(lm);
  const gesture = fingers ? nameOf(countFingers(fingers, thumbSpread(lm), t)) : null;

  // El orden importa: primero lo que impide VER bien la mano, después la forma. Si la mano
  // está lejos, los dedos van a salir ambiguos de todas formas — decir "marca bien los dedos"
  // cuando el problema es la distancia manda a la persona a corregir lo que no toca.
  const blocking = worstOf(factors, 0.5);
  const reason = blocking ?? (!fingers ? "dedos-ambiguos" : !gesture ? "sin-significado" : worstOf(factors, 0.7));
  return { gesture, confidence, reason, factors, center };
}

/** El factor que más estorba, si está por debajo del listón que se pida. */
function worstOf(f: Reading["factors"], threshold: number): Reason | null {
  const worst = [
    { v: f.presence, r: "lejos" as const },
    { v: f.facing, r: "de-canto" as const },
    { v: f.steadiness, r: "en-movimiento" as const },
    { v: f.clarity, r: "dedos-ambiguos" as const },
  ].reduce((a, b) => (b.v < a.v ? b : a));
  return worst.v < threshold ? worst.r : null;
}

/**
 * Cuántos dedos hay levantados → qué seña es.
 *
 * El puño y los cuatro dedos NO significan nada, a propósito: el puño es la postura natural de
 * una mano en reposo, y el cuatro se confundía con el tres y con la palma porque dependía de
 * leer bien el pulgar. Un vocabulario corto y separado se equivoca mucho menos que uno amplio.
 */
function nameOf(n: number): Gesture | null {
  if (n === 1) return "uno";
  if (n === 2) return "dos";
  if (n === 3) return "tres";
  if (n === 5) return "palma";
  return null;
}

/** Texto para la persona. Habla de lo que puede hacer, no de la métrica. */
export function adviceFor(reason: Reason | null): string | null {
  switch (reason) {
    case "sin-mano": return null;
    case "fuera-de-cuadro": return "Aléjate un poco: no cabe tu mano";
    case "lejos": return "Acerca la mano a la cámara";
    case "de-canto": return "Muestra la palma de frente";
    case "en-movimiento": return "Mantén la mano quieta";
    case "dedos-ambiguos": return "Marca bien los dedos: estirados o recogidos";
    case "sin-significado": return null; // el puño y los 4 dedos no son señas
    default: return null;
  }
}
