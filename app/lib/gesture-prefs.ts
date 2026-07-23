"use client";

// Preferencias del control por gestos. Viven SOLO en este dispositivo, a propósito: nadie más
// —tampoco un admin— tiene por qué saber quién enciende su cámara ni cómo la configura. Por
// eso no tocan Supabase ni Notion, a diferencia del resto de ajustes.
//
// Apagado siempre que no haya un "sí" explícito: cualquier valor raro o ilegible se lee como
// apagado (fail-closed).

const KEY_ON = "curva.gestures.enabled";
const KEY_SOUND = "curva.gestures.sound";
const KEY_SENS = "curva.gestures.sensitivity";
const KEY_SEEN = "curva.gestures.onboarded";

/** Evento local para que el HUD y los Ajustes reaccionen sin recargar. */
export const GESTURE_ENABLED_EVENT = "curva:gestures-enabled";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* modo privado o storage lleno: se queda en el default, que es el lado seguro */
  }
  window.dispatchEvent(new CustomEvent(GESTURE_ENABLED_EVENT));
}

// ── Encendido ──
export function isGestureOptIn(): boolean {
  return read(KEY_ON) === "1";
}
export function setGestureOptIn(on: boolean) {
  write(KEY_ON, on ? "1" : null);
}

// ── Sonido (encendido por defecto: es la única señal de que la cámara te está viendo) ──
export function isSoundOn(): boolean {
  return read(KEY_SOUND) !== "0";
}
export function setSoundOn(on: boolean) {
  write(KEY_SOUND, on ? "1" : "0");
}

// ── Sensibilidad ──
// Cuánto hay que sostener la seña. No es un capricho: quien lo usa a diario lo quiere rápido,
// y quien está en videollamadas todo el día lo quiere lento para que un saludo no le mueva el
// cronómetro. Un solo valor no le sirve a los dos.
export type Sensitivity = "rapido" | "normal" | "tranquilo";

export const SENSITIVITY: Record<Sensitivity, { label: string; hint: string; dwellMs: number; cooldownMs: number }> = {
  rapido: { label: "Rápido", hint: "0.8 s — para quien ya le agarró el modo", dwellMs: 800, cooldownMs: 1500 },
  normal: { label: "Normal", hint: "1.2 s — el equilibrio recomendado", dwellMs: 1200, cooldownMs: 2000 },
  tranquilo: { label: "Tranquilo", hint: "2 s — si estás mucho en videollamada", dwellMs: 2000, cooldownMs: 2500 },
};

export function getSensitivity(): Sensitivity {
  const v = read(KEY_SENS);
  return v === "rapido" || v === "tranquilo" ? v : "normal";
}
export function setSensitivity(s: Sensitivity) {
  write(KEY_SENS, s);
}

// ── Primer uso ──
// Para enseñar las señas una vez, sin volverse un estorbo después.
export function hasOnboarded(): boolean {
  return read(KEY_SEEN) === "1";
}
export function markOnboarded() {
  write(KEY_SEEN, "1");
}
