import { describe, it, expect } from "vitest";
import {
  readGestures, commandForGesture, MIN_SCORE,
  GESTURE_LABEL, GESTURE_EMOJI, type Gesture, type ModelGesture,
} from "@/lib/gestures/recognizer";
import { resolveCommand } from "@/lib/timer-commands";

// Con el modelo entrenado, esta capa es trivial y DETERMINISTA: traduce la categoría que
// devuelve MediaPipe a nuestra seña. Ya no se finge que "landmarks sintéticos = realidad"; la
// clasificación es del modelo, y aquí solo se prueba el mapeo, que sí se puede probar de verdad.

const g = (categoryName: string, score = 0.9): ModelGesture => ({ categoryName, score });

describe("readGestures — mapeo de categorías del modelo", () => {
  it("traduce cada categoría a su seña", () => {
    expect(readGestures([g("Open_Palm")]).gesture).toBe("palma");
    expect(readGestures([g("Pointing_Up")]).gesture).toBe("uno");
    expect(readGestures([g("Victory")]).gesture).toBe("dos");
    expect(readGestures([g("Thumb_Up")]).gesture).toBe("pulgar");
  });

  it("las categorías sin significado no son señas (puño, pulgar abajo, ILoveYou, nada)", () => {
    // Sin landmarks de 3 dedos, ninguna de estas es un comando.
    for (const cat of ["Closed_Fist", "Thumb_Down", "ILoveYou", "None"]) {
      expect(readGestures([g(cat)]).gesture, cat).toBeNull();
    }
  });

  it("pasa la confianza del modelo tal cual", () => {
    expect(readGestures([g("Open_Palm", 0.42)]).confidence).toBe(0.42);
  });

  it("conserva la categoría cruda para el diagnóstico, signifique algo o no", () => {
    expect(readGestures([g("Open_Palm")]).raw).toBe("Open_Palm");
    expect(readGestures([g("Closed_Fist")]).raw).toBe("Closed_Fist");
  });

  it("sin manos no hay nada", () => {
    const r = readGestures([]);
    expect(r.gesture).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.raw).toBeNull();
  });

  it("con dos manos manda la seña de mayor confianza", () => {
    // La otra mano sobre el teclado, o alguien atrás: gana la que el modelo ve más clara.
    const r = readGestures([g("Victory", 0.6), g("Open_Palm", 0.95)]);
    expect(r.gesture).toBe("palma");
    expect(r.confidence).toBe(0.95);
  });

  it("si una mano no significa nada pero es la más confiable, no inventa una seña", () => {
    const r = readGestures([g("Closed_Fist", 0.99), g("Victory", 0.5)]);
    // El puño gana en confianza pero no es seña; la victoria sí, aunque menos confiable.
    expect(r.gesture).toBe("dos");
  });
});

describe("el umbral es un solo número", () => {
  it("MIN_SCORE está en un rango sensato", () => {
    expect(MIN_SCORE).toBeGreaterThan(0.3);
    expect(MIN_SCORE).toBeLessThan(0.9);
  });
});

describe("de la seña al comando del cronómetro", () => {
  it("los dedos eligen tarea, la palma pausa, el pulgar reanuda", () => {
    expect(commandForGesture("uno")).toEqual({ kind: "switch", index: 0 });
    expect(commandForGesture("dos")).toEqual({ kind: "switch", index: 1 });
    expect(commandForGesture("tres")).toEqual({ kind: "switch", index: 2 });
    expect(commandForGesture("palma")).toEqual({ kind: "pause" });
    expect(commandForGesture("pulgar")).toEqual({ kind: "resume" });
  });

  it("la palma pausa la tarea que corre", () => {
    const action = resolveCommand(commandForGesture("palma"), { openTasks: ["a"], activeTaskId: "a" });
    expect(action).toEqual({ kind: "pause", taskId: "a" });
  });

  it("dos dedos cambian a la segunda tarea", () => {
    const action = resolveCommand(commandForGesture("dos"), { openTasks: ["a", "b"], activeTaskId: "a" });
    expect(action).toEqual({ kind: "switch", taskId: "b", index: 1 });
  });

  it("el pulgar reanuda cuando no hay nada corriendo", () => {
    const action = resolveCommand(commandForGesture("pulgar"), { openTasks: ["a", "b"], activeTaskId: null });
    expect(action).toEqual({ kind: "switch", taskId: "a", index: 0 });
  });
});

describe("etiquetas y emojis completos", () => {
  it("cada seña tiene nombre y emoji", () => {
    for (const s of ["uno", "dos", "tres", "palma", "pulgar"] as Gesture[]) {
      expect(GESTURE_LABEL[s]).toBeTruthy();
      expect(GESTURE_EMOJI[s]).toBeTruthy();
    }
  });
});

// ── El "tres dedos" por conteo ──────────────────────────────────────────────────────────
// El modelo entrenado no tiene una categoría de "tres dedos", pero Andrés quiere hacer el 3
// con la mano. Se resuelve contando los puntos que el propio modelo devuelve, SOLO para el 3 y
// SOLO cuando el modelo no reconoció una de sus formas. Aquí las manos sintéticas sí son
// legítimas: countFingers es geometría simple y determinista sobre puntos tipo MediaPipe.
import { countFingers, type Landmark } from "@/lib/gestures/recognizer";

const WRIST = { x: 0.5, y: 0.78 };
// Construye una mano con N dedos largos extendidos (índice→meñique) y opcional pulgar.
function hand(fingers: [boolean, boolean, boolean, boolean], thumb = false): Landmark[] {
  const along = (dx: number, dy: number, d: number): Landmark => {
    const len = Math.hypot(dx, dy);
    return { x: WRIST.x + (dx / len) * d, y: WRIST.y + (dy / len) * d };
  };
  const dirs: [number, number][] = [[-0.3, -1], [-0.08, -1], [0.14, -1], [0.36, -1]];
  const lm: Landmark[] = [{ ...WRIST }];
  // pulgar (0-4): recogido cruza sobre la palma; abierto se va al lado.
  const idx0 = along(-0.3, -1, 0.09);
  const tx = thumb ? idx0.x - 0.16 : idx0.x + 0.02;
  lm[1] = { x: idx0.x - 0.04, y: idx0.y + 0.05 }; lm[2] = { x: idx0.x - 0.08, y: idx0.y + 0.04 };
  lm[3] = { x: idx0.x - 0.12, y: idx0.y + 0.03 }; lm[4] = { x: tx, y: idx0.y + 0.02 };
  dirs.forEach(([dx, dy], i) => {
    const base = 5 + i * 4;
    lm[base] = along(dx, dy, 0.09);
    lm[base + 1] = along(dx, dy, 0.15);
    lm[base + 2] = along(dx, dy, 0.19);
    lm[base + 3] = along(dx, dy, fingers[i] ? 0.28 : 0.10);
  });
  return lm;
}

const withLm = (categoryName: string, landmarks: Landmark[], score = 0.2): ModelGesture =>
  ({ categoryName, score, landmarks });

describe("tres dedos por conteo", () => {
  it("countFingers cuenta bien", () => {
    expect(countFingers(hand([true, true, true, false]))).toBe(3); // 3 dedos, sin pulgar
    expect(countFingers(hand([true, true, false, false], true))).toBe(3); // 3 a la mexicana
    expect(countFingers(hand([true, true, false, false]))).toBe(2);
    expect(countFingers(hand([true, true, true, true]))).toBe(4);
    expect(countFingers([])).toBe(-1);
  });

  it("con 3 dedos y sin categoría del modelo, es la tarea 3", () => {
    const r = readGestures([withLm("None", hand([true, true, true, false]))]);
    expect(r.gesture).toBe("tres");
    expect(r.raw).toBe("3 dedos");
  });

  it("acepta el 3 a la mexicana (pulgar + índice + medio)", () => {
    const r = readGestures([withLm("None", hand([true, true, false, false], true))]);
    expect(r.gesture).toBe("tres");
  });

  it("una forma robusta del modelo GANA al conteo (no se pisa la palma con 3)", () => {
    // Si el modelo dijo Open_Palm con confianza, eso manda aunque el conteo dé otra cosa.
    const r = readGestures([withLm("Open_Palm", hand([true, true, true, false]), 0.95)]);
    expect(r.gesture).toBe("palma");
  });

  it("dos dedos NO se cuentan como tres", () => {
    const r = readGestures([withLm("None", hand([true, true, false, false]))]);
    expect(r.gesture).toBeNull();
  });
});
