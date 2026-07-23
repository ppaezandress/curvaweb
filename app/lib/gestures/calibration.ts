"use client";

// Calibración: que el sistema aprenda TU mano en vez de imponerte la mía.
//
// Por qué existe. Los umbrales estaban puestos a ojo — cuánto tiene que alejarse una punta
// para contar como dedo estirado, qué tan grande debe verse la mano para considerarla
// presentada. Esos números dependen de cosas que cambian con cada persona: el largo de los
// dedos, el ángulo de la cámara, a qué distancia se sienta uno, si la laptop está en alto.
// Ajustarlos "un poco más" a partir de descripciones no converge nunca: lo que arregla a una
// persona rompe a la siguiente.
//
// La salida es medir. Se le pide a cada quien que enseñe la mano abierta y luego el puño; con
// esos dos extremos se calculan SUS umbrales, con el corte a medio camino entre lo que de
// verdad hace. Se guarda en el dispositivo y se puede rehacer cuando cambie el escritorio.

export type Thresholds = {
  /** Punta/nudillo a partir del cual un dedo largo cuenta como estirado. */
  openRatio: number;
  /** ...y por debajo del cual cuenta como recogido. */
  closedRatio: number;
  /** Separación del pulgar (en tamaños de mano) para contarlo abierto. */
  thumbFar: number;
  /** ...y recogido. */
  thumbNear: number;
  /** Tamaño mínimo para considerar que la mano está PRESENTADA a la cámara. */
  minPresentScale: number;
};

// Valores de fábrica: los que traía el sistema antes de poder calibrar. Sirven mientras nadie
// calibre, y de red de seguridad si una calibración sale absurda.
export const DEFAULT_THRESHOLDS: Thresholds = {
  openRatio: 1.16,
  closedRatio: 1.02,
  thumbFar: 1.15,
  thumbNear: 0.75,
  minPresentScale: 0.15,
};

/** Lo que se mide en cada cuadro durante la calibración. */
export type Sample = {
  /** Punta/nudillo de índice, medio, anular y meñique. */
  fingers: number[];
  /** Separación del pulgar respecto al nudillo del índice, en tamaños de mano. */
  thumb: number;
  /** Tamaño aparente de la mano. */
  scale: number;
};

const KEY = "curva.gestures.calibration";

export function loadThresholds(): Thresholds {
  if (typeof window === "undefined") return DEFAULT_THRESHOLDS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const t = JSON.parse(raw) as Partial<Thresholds>;
    return sane({ ...DEFAULT_THRESHOLDS, ...t });
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function saveThresholds(t: Thresholds) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sane(t)));
  } catch {
    /* sin guardar: se seguirá con los de fábrica */
  }
}

export function clearCalibration() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada que hacer */
  }
}

export function isCalibrated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

/** Ningún umbral calibrado puede salirse de lo razonable, pase lo que pase en la medición. */
function sane(t: Thresholds): Thresholds {
  const clamp = (v: number, lo: number, hi: number) => (isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
  const closedRatio = clamp(t.closedRatio, 0.85, 1.15);
  const openRatio = clamp(t.openRatio, closedRatio + 0.04, 1.6);
  const thumbNear = clamp(t.thumbNear, 0.3, 1.2);
  const thumbFar = clamp(t.thumbFar, thumbNear + 0.15, 2.5);
  return {
    openRatio,
    closedRatio,
    thumbFar,
    thumbNear,
    minPresentScale: clamp(t.minPresentScale, 0.05, 0.35),
  };
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Calcula los umbrales a partir de dos posturas medidas: mano abierta y puño.
 *
 * Se usa la mediana de cada tanda (no el promedio) para que un cuadro raro no arrastre el
 * resultado, y el corte se pone a medio camino entre las dos posturas, con algo de margen
 * hacia el lado seguro. Si las dos tandas salen parecidas — señal de que la calibración fue
 * mala — se devuelven los valores de fábrica en vez de un ajuste sin sentido.
 */
export function computeThresholds(open: Sample[], closed: Sample[]): Thresholds | null {
  if (open.length < 5 || closed.length < 5) return null;

  const openFingers = median(open.flatMap((s) => s.fingers));
  const closedFingers = median(closed.flatMap((s) => s.fingers));
  const openThumb = median(open.map((s) => s.thumb));
  const closedThumb = median(closed.map((s) => s.thumb));
  const scale = median(open.map((s) => s.scale));

  if (![openFingers, closedFingers, openThumb, closedThumb, scale].every((v) => isFinite(v))) return null;
  // Las dos posturas tienen que haber salido claramente distintas.
  if (openFingers - closedFingers < 0.06) return null;
  if (openThumb - closedThumb < 0.2) return null;

  const midFingers = (openFingers + closedFingers) / 2;
  const spanFingers = (openFingers - closedFingers) / 2;
  const midThumb = (openThumb + closedThumb) / 2;
  const spanThumb = (openThumb - closedThumb) / 2;

  return sane({
    // La zona muerta ocupa el 40% central del recorrido real de cada quien.
    openRatio: midFingers + spanFingers * 0.2,
    closedRatio: midFingers - spanFingers * 0.2,
    thumbFar: midThumb + spanThumb * 0.2,
    thumbNear: midThumb - spanThumb * 0.2,
    // "Presentada" = un poco más chica de como la enseñaste al calibrar: así se acepta tu
    // postura natural sin dejar pasar una mano que anda en otra cosa, más lejos.
    minPresentScale: scale * 0.72,
  });
}
