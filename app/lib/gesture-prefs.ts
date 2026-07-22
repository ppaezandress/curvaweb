"use client";

// Preferencia del control por gestos. Vive SOLO en este dispositivo, a propósito: nadie más
// —tampoco un admin— tiene por qué saber quién enciende su cámara ni cuándo. Por eso no toca
// Supabase ni Notion, a diferencia del resto de ajustes.
//
// Apagado siempre que no haya un "sí" explícito: cualquier valor raro o ilegible se lee como
// apagado (fail-closed).
const KEY = "curva.gestures.enabled";

/** Evento local para que el HUD reaccione al toggle de Ajustes sin recargar. */
export const GESTURE_ENABLED_EVENT = "curva:gestures-enabled";

export function isGestureOptIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setGestureOptIn(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* modo privado o storage lleno: se queda apagado, que es el lado seguro */
  }
  window.dispatchEvent(new CustomEvent(GESTURE_ENABLED_EVENT));
}
