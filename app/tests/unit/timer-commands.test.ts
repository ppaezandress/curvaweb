import { describe, it, expect } from "vitest";
import { resolveCommand, commandForKey, describeAction } from "@/lib/timer-commands";

// Esta capa la comparten el teclado y los gestos. Si se rompe, se rompen los dos mandos a la
// vez — por eso es la más probada del feature.

const ctx = (openTasks: string[], activeTaskId: string | null = null) => ({ openTasks, activeTaskId });

describe("resolveCommand — cambiar de tarea", () => {
  it("manda a la n-ésima tarea del dock", () => {
    expect(resolveCommand({ kind: "switch", index: 0 }, ctx(["a", "b", "c"]))).toEqual({
      kind: "switch", taskId: "a", index: 0,
    });
    expect(resolveCommand({ kind: "switch", index: 2 }, ctx(["a", "b", "c"]))).toEqual({
      kind: "switch", taskId: "c", index: 2,
    });
  });

  it("no hace nada si no hay tantas tareas abiertas", () => {
    expect(resolveCommand({ kind: "switch", index: 3 }, ctx(["a", "b"]))).toBeNull();
    expect(resolveCommand({ kind: "switch", index: 0 }, ctx([]))).toBeNull();
  });

  it("NO reinicia la tarea que ya está corriendo", () => {
    // `switchTo` es `start`, y `start` sobre la tarea activa cierra el tramo y abre otro:
    // partiría el historial en dos cada vez que sostienes el gesto.
    expect(resolveCommand({ kind: "switch", index: 0 }, ctx(["a", "b"], "a"))).toBeNull();
  });

  it("sí cambia si la activa es otra", () => {
    expect(resolveCommand({ kind: "switch", index: 1 }, ctx(["a", "b"], "a"))).toEqual({
      kind: "switch", taskId: "b", index: 1,
    });
  });
});

describe("resolveCommand — pausar", () => {
  it("pausa la tarea que está corriendo", () => {
    expect(resolveCommand({ kind: "pause" }, ctx(["a"], "a"))).toEqual({ kind: "pause", taskId: "a" });
  });

  it("no hace nada si no hay nada corriendo", () => {
    expect(resolveCommand({ kind: "pause" }, ctx(["a"], null))).toBeNull();
    expect(resolveCommand({ kind: "pause" }, ctx([], null))).toBeNull();
  });
});

describe("resolveCommand — reanudar (puño)", () => {
  it("sigue con la primera tarea del dock sin tener que recordar su número", () => {
    expect(resolveCommand({ kind: "resume" }, ctx(["a", "b"], null))).toEqual({
      kind: "switch", taskId: "a", index: 0,
    });
  });

  it("si ya está corriendo no hace nada (no reinicia el tramo)", () => {
    expect(resolveCommand({ kind: "resume" }, ctx(["a", "b"], "b"))).toBeNull();
  });

  it("con el dock vacío no hay nada que reanudar", () => {
    expect(resolveCommand({ kind: "resume" }, ctx([], null))).toBeNull();
  });
});

describe("resolveCommand — toggle (Espacio)", () => {
  it("pausa si algo corre", () => {
    expect(resolveCommand({ kind: "toggle" }, ctx(["a", "b"], "b"))).toEqual({ kind: "pause", taskId: "b" });
  });

  it("reanuda la primera del dock si nada corre", () => {
    expect(resolveCommand({ kind: "toggle" }, ctx(["a", "b"], null))).toEqual({
      kind: "switch", taskId: "a", index: 0,
    });
  });

  it("con el dock vacío no hace nada", () => {
    expect(resolveCommand({ kind: "toggle" }, ctx([], null))).toBeNull();
  });
});

describe("commandForKey", () => {
  it("mapea 1-9 a cambiar de pestaña (0-based)", () => {
    expect(commandForKey({ code: "Digit1", key: "1" })).toEqual({ kind: "switch", index: 0 });
    expect(commandForKey({ code: "Digit9", key: "9" })).toEqual({ kind: "switch", index: 8 });
  });

  it("Espacio hace toggle", () => {
    expect(commandForKey({ code: "Space", key: " " })).toEqual({ kind: "toggle" });
  });

  it("ignora el 0 y cualquier otra tecla", () => {
    expect(commandForKey({ code: "Digit0", key: "0" })).toBeNull();
    expect(commandForKey({ code: "KeyA", key: "a" })).toBeNull();
    expect(commandForKey({ code: "Escape", key: "Escape" })).toBeNull();
  });
});

describe("describeAction", () => {
  it("dice qué pasó, con el nombre de la tarea", () => {
    expect(describeAction({ kind: "switch", taskId: "a", index: 0 }, "Propuesta Balmori")).toBe(
      "Midiendo · Propuesta Balmori",
    );
    expect(describeAction({ kind: "pause", taskId: "a" }, "Propuesta Balmori")).toBe(
      "En pausa · Propuesta Balmori",
    );
  });

  it("aguanta que no se sepa el nombre", () => {
    expect(describeAction({ kind: "pause", taskId: "a" })).toBe("En pausa · la tarea");
    expect(describeAction({ kind: "pause", taskId: "a" }, "   ")).toBe("En pausa · la tarea");
  });
});
