"use client";

// Sonido del control por gestos. Sin archivos: los tonos se generan con WebAudio, así que no
// pesan nada, no hay que descargarlos y suenan igual en cualquier equipo.
//
// Para qué sirve: cuando le hablas a una cámara no tienes forma de saber si te está viendo.
// El sonido cierra ese vacío — un tic bajito al detectar tu mano ("te veo") y un tono más
// alto y claro al ejecutar ("lo hice"). Sin eso, uno se queda haciendo señas sin saber si el
// problema es la seña, la luz o la cámara.
//
// Suena discreto a propósito: esto puede sonar en una llamada con cliente.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    // Los navegadores suspenden el audio hasta que hay un gesto del usuario; encender la
    // cámara cuenta como tal, pero por si acaso se reanuda aquí.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Un tono corto y suave. `freq` en Hz, `ms` de duración, `gain` 0..1. */
function beep(freq: number, ms: number, gain: number) {
  const a = audio();
  if (!a) return;
  try {
    const osc = a.createOscillator();
    const vol = a.createGain();
    osc.type = "sine"; // sin armónicos duros: no molesta en una llamada
    osc.frequency.value = freq;
    // Ataque y caída rápidos pero no instantáneos: un corte seco suena a "clic" de error.
    const t = a.currentTime;
    vol.gain.setValueAtTime(0, t);
    vol.gain.linearRampToValueAtTime(gain, t + 0.012);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(vol);
    vol.connect(a.destination);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
  } catch {
    /* el sonido nunca puede romper el control por gestos */
  }
}

/** "Te veo": empezó a reconocer un gesto. Bajito, porque pasa seguido. */
export function playDetected() {
  beep(660, 70, 0.05);
}

/** "Listo, lo hice": el comando se ejecutó. Más alto y claro, es el que importa. */
export function playConfirmed() {
  beep(880, 90, 0.11);
  setTimeout(() => beep(1170, 110, 0.09), 90); // segundo tono: sensación de "cerrado"
}

/** El gesto no aplicaba (no hay esa tarea abierta). Bajo y grave, sin dramatismo. */
export function playIgnored() {
  beep(300, 120, 0.06);
}

const KEY = "curva.gestures.sound";

export function isSoundOn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(KEY) !== "0"; // encendido por defecto
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* si no se puede guardar, queda encendido para esta sesión */
  }
}
