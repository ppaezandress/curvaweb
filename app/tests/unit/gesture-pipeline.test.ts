import { describe, it, expect } from "vitest";
import { readFrame, adviceFor, type Reason } from "@/lib/gestures/reader";
import { createIntegrator, weightOf } from "@/lib/gestures/integrator";
import { commandForGesture, type Landmark } from "@/lib/gestures/vocabulary";
import { resolveCommand } from "@/lib/timer-commands";

// ── Manos como se ven en una webcam ─────────────────────────────────────────────────────
//
// Este banco es la lección de toda la racha de fallos. Las manos sintéticas anteriores eran
// geométricamente perfectas —dedos o del todo estirados o del todo recogidos, pulgar siempre
// inequívoco—, así que las pruebas pasaban mientras la función fallaba delante de una cámara
// real. Aquí las manos se parecen a las de verdad: el pulgar de una palma abierta queda a medio
// camino, y hay posturas que NO son señas (celular en la mano, mano en la cara, mano de paso).

const WRIST = { x: 0.5, y: 0.78 };

/** Construye una mano con control fino sobre cada parte. */
function hand(opts: {
  /** Cuántos dedos largos estirados, de índice a meñique. */
  fingers: [boolean, boolean, boolean, boolean];
  /** "abierto" | "pegado" | "medias" — el pulgar de una palma real suele quedar a medias. */
  thumb: "abierto" | "pegado" | "medias";
  /** Tamaño aparente: 1 = mano presentada a la cámara. */
  scale?: number;
  /** 1 = de frente · 0.3 = de canto. */
  facing?: number;
  offsetX?: number;
}): Landmark[] {
  const { fingers, thumb, scale = 1, facing = 1, offsetX = 0 } = opts;
  const palm = 0.2 * scale; // muñeca → nudillo medio
  const w = { x: WRIST.x + offsetX, y: WRIST.y };
  const lm: Landmark[] = [];
  lm[0] = { ...w, z: 0 };

  const dirs: [number, number][] = [[-0.3, -1], [-0.08, -1], [0.14, -1], [0.36, -1]];
  const along = (d: [number, number], dist: number): Landmark => {
    const len = Math.hypot(d[0], d[1]);
    // Al girarse de canto la mano se estrecha en pantalla Y los nudillos quedan a distinta
    // profundidad: lo segundo es lo que ve el modelo en 3D, y sin ello el fixture no se
    // parecería a una mano real girada.
    const lateral = (d[0] / len) * dist;
    return {
      x: w.x + lateral * facing,
      y: w.y + (d[1] / len) * dist,
      z: lateral * Math.sqrt(Math.max(0, 1 - facing * facing)),
    };
  };

  dirs.forEach((d, i) => {
    const base = 5 + i * 4;
    lm[base] = along(d, palm);
    lm[base + 1] = along(d, palm * 1.5);
    lm[base + 2] = along(d, palm * 1.8);
    lm[base + 3] = along(d, fingers[i] ? palm * 2.2 : palm * 0.95);
  });

  const indexMcp = lm[5];
  const spread = thumb === "abierto" ? 1.35 : thumb === "medias" ? 0.95 : 0.4;
  const tip: Landmark = { x: indexMcp.x - palm * spread, y: indexMcp.y + palm * 0.3, z: 0 };
  lm[1] = { x: indexMcp.x - palm * spread * 0.25, y: indexMcp.y + palm * 0.5, z: 0 };
  lm[2] = { x: indexMcp.x - palm * spread * 0.5, y: indexMcp.y + palm * 0.45, z: 0 };
  lm[3] = { x: indexMcp.x - palm * spread * 0.75, y: indexMcp.y + palm * 0.35, z: 0 };
  lm[4] = tip;
  return lm;
}

const PALMA_REAL = hand({ fingers: [true, true, true, true], thumb: "medias" });
const UNO = hand({ fingers: [true, false, false, false], thumb: "pegado" });
const DOS = hand({ fingers: [true, true, false, false], thumb: "pegado" });
const TRES = hand({ fingers: [true, true, true, false], thumb: "pegado" });
const PUÑO = hand({ fingers: [false, false, false, false], thumb: "pegado" });

// Posturas que NO son señas.
const CELULAR = hand({ fingers: [true, true, false, false], thumb: "medias", scale: 0.45 });
const EN_LA_CARA = hand({ fingers: [true, true, true, false], thumb: "medias", facing: 0.25 });

const quieta = 0.03;

describe("lectura de un cuadro", () => {
  it("reconoce las señas del vocabulario con buena confianza", () => {
    const casos: [string, Landmark[], string][] = [
      ["palma", PALMA_REAL, "palma"],
      ["1 dedo", UNO, "uno"],
      ["2 dedos", DOS, "dos"],
      ["3 dedos", TRES, "tres"],
    ];
    for (const [nombre, lm, esperado] of casos) {
      const r = readFrame({ hands: [lm], speed: quieta });
      expect(r.gesture, `falló ${nombre}`).toBe(esperado);
      expect(r.confidence, `confianza baja en ${nombre}`).toBeGreaterThan(0.6);
    }
  });

  it("la palma no se penaliza por el pulgar a medias", () => {
    // Fue el fallo más repetido: la seña se reconocía pero puntuaba como dudosa.
    const r = readFrame({ hands: [PALMA_REAL], speed: quieta });
    expect(r.gesture).toBe("palma");
    expect(weightOf(r.confidence)).toBe(1); // avanza a velocidad plena
  });

  it("el puño no significa nada (es la mano en reposo)", () => {
    expect(readFrame({ hands: [PUÑO], speed: quieta }).gesture).toBeNull();
  });

  it("dos palmas a la vez son su propio gesto", () => {
    const otra = hand({ fingers: [true, true, true, true], thumb: "medias", offsetX: 0.3 });
    expect(readFrame({ hands: [PALMA_REAL, otra], speed: quieta }).gesture).toBe("dosPalmas");
  });
});

describe("posturas que no son señas", () => {
  const casosMalos: [string, Landmark[], number][] = [
    ["celular en la mano", CELULAR, quieta],
    ["mano en la cara", EN_LA_CARA, quieta],
    ["mano de paso", DOS, 1.6],
  ];

  it("no alcanzan confianza para ejecutar", () => {
    for (const [nombre, lm, speed] of casosMalos) {
      const r = readFrame({ hands: [lm], speed });
      expect(weightOf(r.confidence), `${nombre} avanzaría`).toBe(0);
    }
  });

  it("y cada una dice QUÉ falla, sin rechazos mudos", () => {
    const razones: Record<string, Reason> = {
      celular: readFrame({ hands: [CELULAR], speed: quieta }).reason!,
      cara: readFrame({ hands: [EN_LA_CARA], speed: quieta }).reason!,
      paso: readFrame({ hands: [DOS], speed: 1.6 }).reason!,
    };
    expect(razones.celular).toBe("lejos");
    expect(razones.cara).toBe("de-canto");
    expect(razones.paso).toBe("en-movimiento");
    for (const r of Object.values(razones)) expect(adviceFor(r)).toBeTruthy();
  });

  it("sin manos lo dice también", () => {
    const r = readFrame({ hands: [], speed: 0 });
    expect(r.reason).toBe("sin-mano");
    expect(r.gesture).toBeNull();
  });
});

// ── De la seña al comando ───────────────────────────────────────────────────────────────
// La prueba que faltaba: la cadena completa, no cada pieza por su lado.
describe("tubería completa: cámara → comando", () => {
  const sostener = (lm: Landmark[], ms: number, t0 = 0, speed = quieta, step = 50) => {
    const fires: string[] = [];
    for (let t = t0; t < t0 + ms; t += step) {
      const r = readFrame({ hands: [lm], speed });
      const out = integrator.feed(r.gesture, r.confidence, t);
      if (out.fire) fires.push(out.fire);
    }
    return { fires, endT: t0 + ms };
  };
  let integrator = createIntegrator();

  it("sostener la palma acaba pausando el cronómetro", () => {
    integrator = createIntegrator();
    const { fires } = sostener(PALMA_REAL, 1500);
    expect(fires).toEqual(["palma"]);
    const action = resolveCommand(commandForGesture("palma"), { openTasks: ["a"], activeTaskId: "a" });
    expect(action).toEqual({ kind: "pause", taskId: "a" });
  });

  it("sostener dos dedos cambia a la segunda tarea", () => {
    integrator = createIntegrator();
    const { fires } = sostener(DOS, 1500);
    expect(fires).toEqual(["dos"]);
    const action = resolveCommand(commandForGesture("dos"), { openTasks: ["a", "b"], activeTaskId: "a" });
    expect(action).toEqual({ kind: "switch", taskId: "b", index: 1 });
  });

  it("el celular en la mano no ejecuta nada en diez segundos", () => {
    integrator = createIntegrator();
    const { fires } = sostener(CELULAR, 10_000);
    expect(fires).toEqual([]);
  });

  it("la mano en la cara tampoco", () => {
    integrator = createIntegrator();
    const { fires } = sostener(EN_LA_CARA, 10_000);
    expect(fires).toEqual([]);
  });

  it("un parpadeo del modelo no obliga a empezar de nuevo", () => {
    integrator = createIntegrator();
    // Medio segundo de palma, un cuadro suelto mal leído, y se sigue: debe disparar igual.
    let t = 0;
    const fires: string[] = [];
    const paso = (lm: Landmark[] | null, ms: number) => {
      for (let e = 0; e < ms; e += 50) {
        const r = lm ? readFrame({ hands: [lm], speed: quieta }) : { gesture: null, confidence: 0 };
        const out = integrator.feed(r.gesture, r.confidence, t);
        if (out.fire) fires.push(out.fire);
        t += 50;
      }
    };
    paso(PALMA_REAL, 600);
    paso(null, 50); // el parpadeo
    paso(PALMA_REAL, 400);
    expect(fires).toEqual(["palma"]);
  });

  it("hay que retirar la mano entre un comando y el siguiente", () => {
    integrator = createIntegrator();
    const a = sostener(DOS, 1500);
    expect(a.fires).toEqual(["dos"]);
    // La mano sigue en cuadro y cambia de postura, como al manipular el celular.
    const b = sostener(TRES, 3000, a.endT);
    expect(b.fires).toEqual([]);
  });
});
