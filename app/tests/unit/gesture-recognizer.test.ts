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
    expect(readGestures([g("ILoveYou")]).gesture).toBe("tres");
    expect(readGestures([g("Thumb_Up")]).gesture).toBe("pulgar");
  });

  it("las categorías sin significado no son señas (puño, pulgar abajo, nada)", () => {
    for (const cat of ["Closed_Fist", "Thumb_Down", "None"]) {
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
