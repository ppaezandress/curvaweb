// Todos los números que deciden si una seña cuenta, en un solo sitio y con su porqué.
//
// Antes estaban repartidos en cuatro archivos: dos filtros de escala distintos, dos de
// orientación, umbrales de dedos, pesos de una media ponderada, tamaños de ventana, tolerancias
// de cuadros… unos veinte, cada uno puesto a ojo en un momento distinto. Con esa dispersión era
// imposible razonar sobre el conjunto: subir uno para frenar falsos positivos hundía señas
// buenas en otro punto, y nadie podía verlo leyendo un archivo.
//
// Quedan ocho, agrupados por lo que responden.

export const TUNING = {
  // ── ¿Se ve bien la mano? ────────────────────────────────────────────────────────────
  /**
   * Cuántas PUNTAS pueden salirse del cuadro sin invalidar la lectura.
   * La palma abierta acercada a la cámara casi siempre deja una fuera; exigir las cinco hacía
   * imposible la seña más usada.
   */
  tipsAllowedOut: 1,

  // ── ¿Está presentada a la cámara? ───────────────────────────────────────────────────
  /**
   * Tamaño aparente (muñeca→nudillo medio) de una mano PRESENTADA a propósito.
   * Sostener el celular, apoyar la mano en la cara o tenerla sobre el teclado la deja bastante
   * más pequeña. La calibración de cada persona lo sustituye por su medida real.
   */
  presentScale: 0.2,
  /** Por debajo de esta fracción de `presentScale` la mano no está hablándole a la cámara. */
  presentFloor: 0.6,

  // ── ¿Está de frente? ────────────────────────────────────────────────────────────────
  /**
   * Proporción ancho/largo de la palma a partir de la cual se considera de frente.
   * Una mano de canto —la típica apoyada en la cara— colapsa ese ancho.
   */
  facingFull: 0.75,
  /** Por debajo de esto está claramente de perfil. */
  facingFloor: 0.35,

  // ── ¿Está quieta? ───────────────────────────────────────────────────────────────────
  /**
   * Velocidad (pantallas por segundo) a partir de la cual deja de parecer una seña sostenida.
   * Sostener la mano ronda 0.05; rascarse o acomodarse el pelo pasa de 1.
   */
  moveLimit: 0.9,

  // ── ¿Cuánto hay que sostenerla? ─────────────────────────────────────────────────────
  /**
   * Confianza mínima para que el progreso avance. Por debajo, el cuadro no suma nada.
   * No es una puerta dura de "sí o no": es el punto donde la evidencia deja de servir.
   */
  minConfidence: 0.45,
  /** A partir de aquí la seña se considera impecable y avanza a velocidad plena. */
  goodConfidence: 0.75,
} as const;

/**
 * Tras ejecutar un comando hay que RETIRAR la mano: tiempo seguido sin ninguna seña antes de
 * admitir el siguiente. Sin esto, una mano ocupada en otra cosa suelta ráfagas.
 */
export const RELEASE_MS = 700;

/**
 * Cuánto se penaliza el progreso cuando aparece OTRA seña, como múltiplo del tiempo.
 *
 * Sustituye a la vieja "tolerancia de N cuadros", que dependía de los cuadros por segundo y por
 * tanto se comportaba distinto en primer plano (20/s) que en segundo plano (12/s). Al medirlo
 * en tiempo, un parpadeo del modelo cuesta lo mismo en cualquier caso: 2× significa que un
 * cambio real borra el avance en la mitad del tiempo que costó ganarlo.
 */
export const SWITCH_DECAY = 2;
