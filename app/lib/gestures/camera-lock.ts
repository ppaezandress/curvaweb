"use client";

// Candado de cámara entre pestañas.
//
// Problema real de producción: si alguien tiene la app abierta en dos pestañas (pasa
// constantemente — una en Tareas, otra en Mensajes), las dos encienden la cámara. Dos
// inferencias corriendo, el doble de batería, y un mismo gesto ejecutado dos veces.
//
// La última pestaña que enciende se queda la cámara y las demás se apagan solas. Se usa
// BroadcastChannel, que es lo que existe justo para hablar entre pestañas del mismo sitio;
// si el navegador no lo soporta, el candado simplemente no aplica (nunca bloquea).

const CHANNEL = "curva.gestures.camera";

export type LockEvent = { type: "claim"; id: string };

export type CameraLock = {
  /** Toma la cámara y avisa a las demás pestañas. */
  claim: () => void;
  /** Deja de escuchar y suelta el canal. */
  release: () => void;
};

/**
 * @param onLost se llama cuando OTRA pestaña reclama la cámara: hay que apagarla aquí.
 */
export function createCameraLock(onLost: () => void): CameraLock {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return { claim: () => {}, release: () => {} };
  }

  // Identificador de esta pestaña: sirve para ignorar los mensajes propios.
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let ch: BroadcastChannel | null = null;

  try {
    ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e: MessageEvent<LockEvent>) => {
      if (e.data?.type === "claim" && e.data.id !== id) onLost();
    };
  } catch {
    return { claim: () => {}, release: () => {} };
  }

  return {
    claim: () => {
      try {
        ch?.postMessage({ type: "claim", id } satisfies LockEvent);
      } catch {
        /* si el canal murió, seguimos sin candado */
      }
    },
    release: () => {
      try {
        ch?.close();
      } catch {
        /* nada que hacer */
      }
      ch = null;
    },
  };
}
