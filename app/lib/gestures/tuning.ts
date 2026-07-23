// Los pocos números que gobiernan cuándo una seña se vuelve una orden.
//
// Antes esto eran ~20 constantes de geometría (umbrales de dedos, escalas, orientación…),
// porque la clasificación se hacía a mano. Con el modelo entrenado esa geometría desapareció:
// el modelo da la seña y su confianza. Lo único que queda por afinar es el ritmo con el que una
// seña sostenida se convierte en comando, y qué confianza se considera suficiente.

export const TUNING = {
  /**
   * Confianza mínima del modelo para que el progreso empiece a avanzar. El propio umbral duro
   * de "es o no es una seña" vive en recognizer.ts (MIN_SCORE); este es el punto donde una
   * detección apenas por encima todavía cuesta más tiempo confirmarla.
   */
  minConfidence: 0.55,
  /** A partir de aquí la seña es inequívoca y avanza a velocidad plena. */
  goodConfidence: 0.75,
} as const;

/**
 * Tras ejecutar un comando hay que RETIRAR la mano: tiempo seguido sin ninguna seña antes de
 * admitir el siguiente. Sin esto, una mano ocupada en otra cosa suelta ráfagas.
 */
export const RELEASE_MS = 700;

/**
 * Cuánto se descuenta el progreso cuando aparece OTRA seña o desaparece la actual, como
 * múltiplo del tiempo. Medido en tiempo (no en cuadros) para que se comporte igual a 20 fps en
 * primer plano que a 12 fps en segundo plano: un parpadeo del modelo cuesta lo mismo siempre.
 */
export const SWITCH_DECAY = 2;
