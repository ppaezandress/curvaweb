// ¿Esto fue un gesto A PROPÓSITO, o solo tu mano pasando por ahí?
//
// Nace de un falso positivo real: al rascarse la cara o apoyar la mano en la barbilla, los
// dedos quedan en una posición que coincide con una seña y el cronómetro se movía solo. Contar
// dedos no basta — hay que distinguir la intención.
//
// Aquí vive la medida de ORIENTACIÓN: una seña se le muestra a la cámara de frente, mientras
// que una mano apoyada en la cara casi siempre queda de canto y la palma se ve aplastada.
//
// La quietud y el resto de señales se combinan en lib/gestures/quality.ts, que las puntúa
// todas juntas en vez de aceptar o rechazar por separado.
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
