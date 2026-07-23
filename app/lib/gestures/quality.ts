// Qué tan buena es la evidencia de que ESTO es una seña hecha a propósito.
//
// Por qué existe: los filtros anteriores eran de sí o no — quieta o no, de frente o no, dedos
// claros o no. Con umbrales duros siempre queda una franja donde se falla en los DOS sentidos
// a la vez: señas de verdad que no entran, y manotazos accidentales que sí. Es exactamente lo
// que se reportó ("a veces no me lo toma, a veces me lo toma sin querer").
//
// La salida es dejar de decidir por cuadro y empezar a PUNTUARLO. Cada señal aporta evidencia:
//
//   claridad de los dedos → ¿están francamente estirados/recogidos, o a medias?
//   palma de frente       → ¿me la estás mostrando, o la tienes de canto en la cara?
//   quietud               → ¿la sostienes, o vas de paso?
//   cercanía              → ¿es tu mano, o alguien al fondo?
//   confianza del modelo  → lo que el propio detector opina de esa mano
//
// Con la nota, el estabilizador puede ser listo: una seña impecable se confirma en medio
// segundo, una regular pide más tiempo, y una mala no avanza nunca. Se gana en las dos puntas.
import { fingerClarity, thumbClarity, handScale, handFullyVisible, currentThresholds, type Landmark } from "@/lib/gestures/vocabulary";
import { palmFacing, palmFlatness, MIN_FACING } from "@/lib/gestures/intent";

export type QualityInput = {
  landmarks: Landmark[];
  /** Velocidad del centro de la mano, en fracciones de pantalla por segundo. */
  speed: number;
  /** Confianza que reporta el modelo para esa mano (0..1). */
  modelScore?: number;
};

export type Quality = {
  /** Nota final 0..1. Por debajo de MIN_QUALITY el cuadro no cuenta para nada. */
  score: number;
  clarity: number;
  facing: number;
  steadiness: number;
  closeness: number;
  /** false = la mano no cabe en el encuadre y no se puede contar bien. */
  visible: boolean;
};

/** Debajo de esto la evidencia es tan pobre que el cuadro se ignora. */
export const MIN_QUALITY = 0.5;

/**
 * La mano tiene que estar PRESENTADA a la cámara, no simplemente estar.
 *
 * Es el filtro que faltaba. Sostener el celular, apoyar la mano en la cara o tenerla sobre el
 * teclado deja la mano a la distancia normal del cuerpo; una seña dirigida a la cámara se
 * acerca a propósito, y entonces se ve claramente más grande. Este mínimo es duro: por debajo
 * no se mira siquiera qué dedos hay, porque la mano no te está hablando a ti.
 */
export const MIN_PRESENT_SCALE = 0.15;

// Velocidad a partir de la cual ya no parece una seña sostenida sino un movimiento.
const STEADY_LIMIT = 0.9;
// Tamaño de mano de una seña bien presentada.
const GOOD_SCALE = 0.22;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function frameQuality({ landmarks, speed, modelScore }: QualityInput): Quality {
  // Requisito duro: la mano tiene que estar presentada. Si no lo está, no importa qué dedos
  // tenga — no te está hablando a ti. Aquí mueren el celular en la mano y la mano en la cara.
  const scale = handScale(landmarks);
  const minPresent = currentThresholds().minPresentScale;

  // Si la mano no cabe, no hay nada que contar — y hay que DECIRLO, porque el remedio es el
  // contrario al de casi todo lo demás: aquí toca alejarse, no acercarse.
  if (!handFullyVisible(landmarks)) {
    return { score: 0, clarity: 0, facing: 0, steadiness: 0, closeness: clamp01(scale / minPresent), visible: false };
  }

  if (scale < minPresent) {
    return { score: 0, clarity: 0, facing: 0, steadiness: 0, closeness: scale / minPresent, visible: true };
  }

  const clarity = fingerClarity(landmarks);
  const thumb = thumbClarity(landmarks);

  // Dos medidas de orientación que se complementan: la proporción de la palma (robusta, 2D) y
  // su inclinación real usando profundidad (más fina, si el modelo la reporta).
  const ratio = palmFacing(landmarks);
  const facingRatio = clamp01((ratio - MIN_FACING) / (1 - MIN_FACING));
  const facing = clamp01(0.5 * facingRatio + 0.5 * palmFlatness(landmarks));

  const steadiness = clamp01(1 - speed / STEADY_LIMIT);
  const closeness = clamp01(scale / Math.max(GOOD_SCALE, minPresent * 1.35));
  const model = clamp01(modelScore ?? 0.9);

  // La claridad de los cuatro dedos largos pesa más que nada: de ella depende que el NÚMERO
  // sea correcto, y equivocarse de número es el error que más molesta (te manda a otra tarea).
  // El pulgar aporta poco a propósito: es ambiguo hasta en una palma bien abierta, y darle
  // peso hundía la nota de la seña más usada.
  const score =
    0.35 * clarity +
    0.07 * thumb +
    0.25 * facing +
    0.18 * steadiness +
    0.10 * closeness +
    0.05 * model;

  return { score: clamp01(score), clarity, facing, steadiness, closeness, visible: true };
}

/** A partir de esta nota la seña se considera impecable y va a velocidad plena. */
const CLEAN_ENOUGH = 0.8;

/**
 * Cuánto avanza el progreso este cuadro, como fracción del tiempo transcurrido.
 *
 * Nunca pasa de 1: el tiempo que elegiste en Ajustes es un mínimo garantizado, no una
 * sugerencia. Si "Tranquilo" dice segundo y medio, son segundo y medio — que una seña muy
 * clara lo acortara a la mitad convertiría ese ajuste en mentira, justo para quien lo puso
 * porque vive en videollamadas.
 *
 * La calidad solo puede FRENAR: evidencia dudosa avanza a paso lento, y por debajo del mínimo
 * no avanza nada. Así lo evidente se confirma en el tiempo prometido y lo ambiguo tiene que
 * insistir mucho más.
 */
export function advanceRate(score: number): number {
  if (score < MIN_QUALITY) return 0;
  if (score >= CLEAN_ENOUGH) return 1;
  // Entre el mínimo y "impecable", de 0.3× a 1×.
  const t = (score - MIN_QUALITY) / (CLEAN_ENOUGH - MIN_QUALITY);
  return 0.3 + t * 0.7;
}


/**
 * Qué corregir para que la seña entre. Devuelve el factor más flojo en lenguaje llano.
 *
 * Es la diferencia entre "a veces no me lo toma" y saber que basta con acercar la mano. Sin
 * esto, quien falla no tiene forma de aprender qué está haciendo distinto.
 */
export function qualityHint(q: Quality): string | null {
  if (q.score >= 0.8) return null;
  // Primero lo que impide leer del todo, y en su orden: si no cabe hay que alejarse, y si
  // cabe pero está lejos hay que acercarse. Confundir estos dos consejos sería peor que no dar
  // ninguno.
  if (!q.visible) return "Aléjate un poco: no cabe tu mano";
  if (q.closeness < 1) return "Acerca la mano a la cámara";
  const worst = [
    { v: q.clarity, tip: "Estira o recoge bien los dedos" },
    { v: q.facing, tip: "Muestra la palma de frente" },
    { v: q.steadiness, tip: "Mantén la mano quieta" },
  ].reduce((a, b) => (b.v < a.v ? b : a));
  return worst.v < 0.75 ? worst.tip : null;
}
