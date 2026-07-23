// ¿Esto fue un gesto A PROPÓSITO, o solo tu mano pasando por ahí?
//
// Nace de un falso positivo real: al rascarse la cara o apoyar la mano en la barbilla, los
// dedos quedan en una posición que coincide con una seña y el cronómetro se movía solo. Contar
// dedos no basta — hay que distinguir la intención.
//
// Dos señales separan un gesto de un movimiento cualquiera:
//
//   1. QUIETUD. Una seña se sostiene en el aire; una mano que se rasca, se acomoda el pelo o
//      va de paso está siempre en movimiento.
//   2. DE FRENTE. Una seña se le muestra a la cámara de frente; una mano apoyada en la cara
//      casi siempre queda de perfil o de canto, y entonces la palma se ve aplastada.
//
// Todo puro y con el tiempo inyectado, para poder probarlo sin cámara.
import type { Landmark } from "@/lib/gestures/vocabulary";

// ── De frente ───────────────────────────────────────────────────────────────────────────
// Se compara el ANCHO de la palma (nudillo del índice ↔ nudillo del meñique) con su LARGO
// (muñeca ↔ nudillo del medio). De frente la palma es casi tan ancha como larga; de perfil el
// ancho se colapsa porque los nudillos se alinean en la línea de visión.
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;
const WRIST = 0;

/** 0 = totalmente de canto · ~1 = de frente. */
export function palmFacing(lm: Landmark[]): number {
  if (!lm || lm.length < 21) return 0;
  const width = Math.hypot(lm[INDEX_MCP].x - lm[PINKY_MCP].x, lm[INDEX_MCP].y - lm[PINKY_MCP].y);
  const length = Math.hypot(lm[WRIST].x - lm[MIDDLE_MCP].x, lm[WRIST].y - lm[MIDDLE_MCP].y);
  if (length <= 0) return 0;
  return width / length;
}

/**
 * Qué tan plana está la mano respecto a la cámara, usando la profundidad de cada punto.
 *
 * El ancho de la palma (arriba) es un buen indicio, pero se confunde con una mano pequeña o
 * girada. Aquí se usa el eje Z que da el modelo: se calcula la NORMAL de la palma (el vector
 * perpendicular que sale de ella) y se mira cuánto apunta hacia la cámara. Una mano de canto
 * — la típica apoyada en la cara — tiene su normal casi perpendicular al objetivo.
 *
 * Devuelve 0..1. Si el modelo no entrega profundidad, devuelve 0.6 (neutro: no penaliza ni
 * premia, para no romper en navegadores que no la reporten).
 */
export function palmFlatness(lm: Landmark[]): number {
  if (!lm || lm.length < 21) return 0.6;
  const w = lm[WRIST], i = lm[INDEX_MCP], p = lm[PINKY_MCP];
  if (w.z === undefined || i.z === undefined || p.z === undefined) return 0.6;

  const a = { x: i.x - w.x, y: i.y - w.y, z: (i.z ?? 0) - (w.z ?? 0) };
  const b = { x: p.x - w.x, y: p.y - w.y, z: (p.z ?? 0) - (w.z ?? 0) };
  // Producto cruz: la normal del plano de la palma.
  const n = {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
  const len = Math.hypot(n.x, n.y, n.z);
  if (len <= 0) return 0.6;
  // |z| de la normal unitaria: 1 = la palma mira de lleno a la cámara.
  return Math.min(1, Math.abs(n.z) / len);
}

/** Por debajo de esto la mano está de canto: no se le hace caso. */
export const MIN_FACING = 0.45;

export function isFacingCamera(lm: Landmark[]): boolean {
  return palmFacing(lm) >= MIN_FACING;
}

// ── Quietud ─────────────────────────────────────────────────────────────────────────────

export type SteadyGate = {
  /** ¿Estaba la mano lo bastante quieta en este cuadro? */
  feed: (center: { x: number; y: number } | null, tMs: number) => boolean;
  reset: () => void;
};

/**
 * @param maxSpeed desplazamiento máximo por segundo, en fracción de pantalla. 0.9 ≈ cruzar el
 * cuadro entero en poco más de un segundo: sostener una seña queda muy por debajo, y rascarse
 * o acomodarse el pelo queda muy por encima.
 */
export function createSteadyGate(maxSpeed = 0.9): SteadyGate {
  let last: { x: number; y: number; t: number } | null = null;

  return {
    feed(center, tMs) {
      if (!center) {
        last = null;
        return false;
      }
      const prev = last;
      last = { ...center, t: tMs };
      if (!prev) return false; // primer cuadro: sin referencia, no se decide todavía

      const dt = (tMs - prev.t) / 1000;
      if (dt <= 0) return true;
      const speed = Math.hypot(center.x - prev.x, center.y - prev.y) / dt;
      return speed <= maxSpeed;
    },
    reset() {
      last = null;
    },
  };
}
