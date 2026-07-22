// Deja en public/mediapipe/ todo lo que necesita el control por gestos, para servirlo desde
// nuestro propio dominio en vez de un CDN ajeno.
//
// No es una manía: la función promete que el video nunca sale del dispositivo, y pedirle el
// modelo a un tercero en cada arranque contradice el espíritu de esa promesa (le revela a otro
// servidor quién usa la función y cuándo). De paso funciona sin internet y deja el camino
// listo para la app de escritorio.
//
// Corre en `prebuild`. Es idempotente: si ya está, no descarga nada.
import { existsSync, mkdirSync, cpSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "mediapipe");
const WASM_SRC = join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const MODEL_OUT = join(OUT, "hand_landmarker.task");
const MIN_MODEL_BYTES = 1_000_000; // un archivo más chico = descarga cortada

mkdirSync(OUT, { recursive: true });

// 1) WASM — se copia desde node_modules para que siempre case con la versión del paquete.
if (!existsSync(WASM_SRC)) {
  console.warn("[mediapipe] no encuentro el wasm en node_modules; ¿falta npm install?");
} else {
  cpSync(WASM_SRC, join(OUT, "wasm"), { recursive: true });
  console.log("[mediapipe] wasm copiado");
}

// 2) Modelo — 7.5 MB, se descarga una vez y se queda en el repo/caché de build.
if (existsSync(MODEL_OUT) && statSync(MODEL_OUT).size > MIN_MODEL_BYTES) {
  console.log("[mediapipe] modelo ya presente");
} else {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_MODEL_BYTES) throw new Error(`descarga incompleta (${buf.length} bytes)`);
    await writeFile(MODEL_OUT, buf);
    console.log(`[mediapipe] modelo descargado (${(buf.length / 1048576).toFixed(1)} MB)`);
  } catch (e) {
    // NO se rompe el build: sin el modelo, el control por gestos simplemente no se ofrece
    // (useGestureControl comprueba que exista antes de encender la cámara).
    console.warn(`[mediapipe] no se pudo bajar el modelo: ${e instanceof Error ? e.message : e}`);
  }
}
