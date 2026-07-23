import { describe, it, expect } from "vitest";
import { createSteadyGate, palmFacing, isFacingCamera, MIN_FACING } from "@/lib/gestures/intent";
import type { Landmark } from "@/lib/gestures/vocabulary";

// Estas dos defensas existen por un falso positivo real: al rascarse la cara o apoyar la mano
// en la barbilla, los dedos coinciden con una seña y el cronómetro se movía solo.

// Mano de frente: la palma se ve casi tan ancha como larga.
function handFacing(): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  lm[0] = { x: 0.5, y: 0.7 }; // muñeca
  lm[5] = { x: 0.42, y: 0.55 }; // nudillo índice
  lm[9] = { x: 0.5, y: 0.53 }; // nudillo medio
  lm[17] = { x: 0.58, y: 0.56 }; // nudillo meñique
  return lm;
}

// Mano de canto: los nudillos se alinean en la línea de visión y el ancho se colapsa.
function handSideways(): Landmark[] {
  const lm = handFacing();
  lm[5] = { x: 0.49, y: 0.55 };
  lm[17] = { x: 0.51, y: 0.56 };
  return lm;
}

describe("palma de frente", () => {
  it("una mano de frente pasa el filtro", () => {
    expect(palmFacing(handFacing())).toBeGreaterThan(MIN_FACING);
    expect(isFacingCamera(handFacing())).toBe(true);
  });

  it("una mano de canto (apoyada en la cara) no cuenta como seña", () => {
    expect(palmFacing(handSideways())).toBeLessThan(MIN_FACING);
    expect(isFacingCamera(handSideways())).toBe(false);
  });

  it("no revienta con datos incompletos", () => {
    expect(palmFacing([])).toBe(0);
    expect(isFacingCamera([])).toBe(false);
  });
});

describe("quietud", () => {
  const at = (x: number, y: number) => ({ x, y });

  it("una mano sostenida en el aire cuenta", () => {
    const gate = createSteadyGate();
    gate.feed(at(0.5, 0.5), 0);
    // Micro-temblor normal de sostener la mano: ~0.002 por cuadro a 20/s.
    expect(gate.feed(at(0.502, 0.501), 50)).toBe(true);
    expect(gate.feed(at(0.503, 0.5), 100)).toBe(true);
  });

  it("una mano que va de paso (rascarse, acomodarse el pelo) NO cuenta", () => {
    const gate = createSteadyGate();
    gate.feed(at(0.2, 0.8), 0);
    expect(gate.feed(at(0.35, 0.6), 50)).toBe(false); // cruza medio cuadro en 50 ms
  });

  it("el primer cuadro nunca decide: hace falta una referencia", () => {
    const gate = createSteadyGate();
    expect(gate.feed(at(0.5, 0.5), 0)).toBe(false);
  });

  it("si la mano desaparece, se pierde la referencia", () => {
    const gate = createSteadyGate();
    gate.feed(at(0.5, 0.5), 0);
    gate.feed(at(0.5, 0.5), 50);
    expect(gate.feed(null, 100)).toBe(false);
    expect(gate.feed(at(0.5, 0.5), 150)).toBe(false); // vuelve a empezar
  });

  it("reset deja el filtro como nuevo", () => {
    const gate = createSteadyGate();
    gate.feed(at(0.5, 0.5), 0);
    gate.reset();
    expect(gate.feed(at(0.5, 0.5), 50)).toBe(false);
  });
});

// ── Puntuación del cuadro ────────────────────────────────────────────────────────────────
// El corazón del "más inteligente": en vez de aceptar o rechazar, se puntúa la evidencia.
import { frameQuality, advanceRate, qualityHint, MIN_QUALITY } from "@/lib/gestures/quality";
import { fingerClarity } from "@/lib/gestures/vocabulary";

// Mano completa y bien formada, del tamaño con el que uno PRESENTA una seña a la cámara
// (la anterior era del tamaño de una mano al fondo del cuadro y ya no califica).
function goodHand(): Landmark[] {
  const wrist = { x: 0.5, y: 0.72 };
  const along = (dx: number, dy: number, d: number): Landmark => {
    const len = Math.hypot(dx, dy);
    return { x: wrist.x + (dx / len) * d, y: wrist.y + (dy / len) * d, z: 0 };
  };
  const lm: Landmark[] = [];
  lm[0] = { ...wrist, z: 0 };
  // pulgar recogido
  lm[1] = { x: 0.42, y: 0.62, z: 0 }; lm[2] = { x: 0.38, y: 0.58, z: 0 };
  lm[3] = { x: 0.34, y: 0.56, z: 0 }; lm[4] = { x: 0.36, y: 0.54, z: 0 };
  // índice y medio estirados, anular y meñique recogidos
  const dirs: [number, number][] = [[-0.25, -1], [0, -1], [0.25, -1], [0.5, -1]];
  const open = [true, true, false, false];
  dirs.forEach(([dx, dy], i) => {
    const base = 5 + i * 4;
    lm[base] = along(dx, dy, 0.20); // nudillo: define el tamaño aparente de la mano
    lm[base + 1] = along(dx, dy, 0.30);
    lm[base + 2] = along(dx, dy, 0.35);
    lm[base + 3] = along(dx, dy, open[i] ? 0.44 : 0.19);
  });
  return lm;
}

describe("frameQuality", () => {
  it("una seña clara, quieta y de frente saca buena nota", () => {
    const q = frameQuality({ landmarks: goodHand(), speed: 0.02, modelScore: 0.95 });
    expect(q.score).toBeGreaterThan(0.6);
    expect(q.clarity).toBeGreaterThan(0.5);
    expect(q.steadiness).toBeGreaterThan(0.9);
  });

  it("la misma seña en movimiento saca peor nota", () => {
    const quieta = frameQuality({ landmarks: goodHand(), speed: 0.02 });
    const movida = frameQuality({ landmarks: goodHand(), speed: 1.5 });
    expect(movida.score).toBeLessThan(quieta.score);
    expect(movida.steadiness).toBe(0);
  });

  it("una mano lejana puntúa por debajo de una cercana", () => {
    const cerca = frameQuality({ landmarks: goodHand(), speed: 0 });
    const lejos = frameQuality({
      landmarks: goodHand().map((p) => ({ x: 0.5 + (p.x - 0.5) * 0.3, y: 0.72 + (p.y - 0.72) * 0.3, z: p.z })),
      speed: 0,
    });
    expect(lejos.closeness).toBeLessThan(cerca.closeness);
    // Una mano que no está presentada ni siquiera se evalúa: sostener el celular o apoyarse la
    // mano en la cara deja la mano a distancia normal del cuerpo, no acercada a la cámara.
    expect(lejos.score).toBe(0);
  });

  it("la nota siempre queda entre 0 y 1", () => {
    for (const speed of [0, 0.5, 5, 100]) {
      const q = frameQuality({ landmarks: goodHand(), speed });
      expect(q.score).toBeGreaterThanOrEqual(0);
      expect(q.score).toBeLessThanOrEqual(1);
    }
  });
});

describe("advanceRate", () => {
  it("la evidencia pobre no avanza nada", () => {
    expect(advanceRate(0)).toBe(0);
    expect(advanceRate(MIN_QUALITY - 0.01)).toBe(0);
  });

  it("nunca corre más que el reloj: el tiempo elegido en Ajustes se respeta", () => {
    // Si una seña muy clara acelerara el disparo, "Tranquilo: 1.5 s" sería mentira justo para
    // quien lo eligió porque vive en videollamadas.
    expect(advanceRate(1)).toBe(1);
    expect(advanceRate(0.9)).toBe(1);
  });

  it("la evidencia dudosa avanza más lento, así que exige insistir", () => {
    const dudosa = advanceRate(MIN_QUALITY + 0.05);
    expect(dudosa).toBeGreaterThan(0);
    expect(dudosa).toBeLessThan(0.6);
  });

  it("crece de forma continua con la nota", () => {
    let prev = -1;
    for (const s of [0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 1]) {
      const r = advanceRate(s);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});

describe("fingerClarity", () => {
  it("una mano con dedos definidos es clara", () => {
    expect(fingerClarity(goodHand())).toBeGreaterThan(0.4);
  });

  it("sin datos no inventa claridad", () => {
    expect(fingerClarity([])).toBe(0);
  });
});

// ── Los casos reales que se colaban ──────────────────────────────────────────────────────
// Reportados con la función ya funcionando: "agarro mi celular y se vuelve loco" y "me pongo
// la mano en la cara e igual me lo toma". Los dos comparten una cosa: la mano está ocupada en
// algo suyo, a la distancia normal del cuerpo, no PRESENTADA a la cámara.
import { createStabilizer } from "@/lib/gestures/stabilizer";
import { MIN_PRESENT_SCALE } from "@/lib/gestures/quality";

describe("manos que no te están hablando", () => {
  const atDistance = (k: number) =>
    goodHand().map((p) => ({ x: 0.5 + (p.x - 0.5) * k, y: 0.72 + (p.y - 0.72) * k, z: p.z }));

  it("una mano a la distancia del cuerpo (celular, cara, teclado) no puntúa", () => {
    // ~40% del tamaño de una seña presentada: lo que se ve al sostener el teléfono.
    expect(frameQuality({ landmarks: atDistance(0.4), speed: 0.05 }).score).toBe(0);
  });

  it("la misma mano acercada a la cámara sí cuenta", () => {
    expect(frameQuality({ landmarks: goodHand(), speed: 0.05 }).score).toBeGreaterThan(0.5);
  });

  it("el aviso dice justo qué hacer", () => {
    const q = frameQuality({ landmarks: atDistance(0.4), speed: 0.05 });
    expect(qualityHint(q)).toBe("Acerca la mano a la cámara");
  });

  it("el mínimo para 'presentada' está por encima de una mano en reposo", () => {
    expect(MIN_PRESENT_SCALE).toBeGreaterThan(0.1);
  });
});

describe("nada de ráfagas", () => {
  // "Se vuelve loco": manipular el celular cambiaba de postura sin parar y cada cambio contaba
  // como una orden nueva. Ahora hay que RETIRAR la mano entre un comando y el siguiente.
  const feed = (st: ReturnType<typeof createStabilizer>, g: "dos" | "tres" | null, ms: number, t0: number) => {
    const fires: string[] = [];
    for (let t = t0; t < t0 + ms; t += 50) {
      const out = st.feed(g, t, 1);
      if (out.fire) fires.push(out.fire);
    }
    return { fires, endT: t0 + ms };
  };

  it("cambiar de seña sin retirar la mano NO dispara otra vez", () => {
    const st = createStabilizer();
    const a = feed(st, "dos", 2000, 0);
    expect(a.fires).toEqual(["dos"]); // el primero sí

    // La mano sigue en cuadro y cambia de postura, como al manipular el celular.
    const b = feed(st, "tres", 3000, a.endT);
    expect(b.fires).toEqual([]);
  });

  it("retirando la mano un momento, el siguiente comando sí entra", () => {
    const st = createStabilizer();
    const a = feed(st, "dos", 2000, 0);
    expect(a.fires).toEqual(["dos"]);

    const pausa = feed(st, null, 1000, a.endT); // la mano sale de cuadro
    expect(pausa.fires).toEqual([]);

    const b = feed(st, "tres", 2000, pausa.endT);
    expect(b.fires).toEqual(["tres"]);
  });

  it("una mano inquieta en cuadro no suelta comandos en cadena", () => {
    const st = createStabilizer();
    let t = 0;
    const fires: string[] = [];
    // Diez segundos alternando posturas sin retirar nunca la mano.
    for (let i = 0; i < 10; i++) {
      const r = feed(st, i % 2 === 0 ? "dos" : "tres", 1000, t);
      fires.push(...r.fires);
      t = r.endT;
    }
    expect(fires.length).toBeLessThanOrEqual(1);
  });
});
