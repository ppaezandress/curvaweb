import { describe, it, expect } from "vitest";
import {
  gestureFrom, fingersUp, handFullyVisible, commandForGesture, GESTURE_LABEL,
  type Landmark, type Gesture,
} from "@/lib/gestures/vocabulary";
import { createStabilizer } from "@/lib/gestures/stabilizer";

// ── Manos sintéticas ────────────────────────────────────────────────────────────────────
// Construimos las 21 marcas como las devolvería MediaPipe (normalizadas 0..1, `y` crece hacia
// abajo): la muñeca abajo al centro y los dedos saliendo en abanico hacia arriba. Cada dedo se
// coloca sobre su propio rayo, así podemos rotar la mano entera y comprobar que el
// reconocimiento aguanta — que es justo lo que no lograba el método de comparar alturas.
// Centrada a propósito: pegada al borde inferior, al rotarla el pulgar se salía del cuadro y
// `handFullyVisible` la descartaba — un artefacto de la mano de prueba, no del algoritmo.
const WRIST: Landmark = { x: 0.5, y: 0.72 };

const DIRS = {
  index: [-0.25, -1],
  middle: [0, -1],
  ring: [0.25, -1],
  pinky: [0.5, -1],
} as const;

const along = (dir: readonly [number, number] | number[], d: number): Landmark => {
  const [dx, dy] = dir;
  const len = Math.hypot(dx, dy);
  return { x: WRIST.x + (dx / len) * d, y: WRIST.y + (dy / len) * d };
};

const EXTENDED = 0.25; // punta lejos de la muñeca
const CURLED = 0.1; // punta recogida, más cerca que el nudillo

type Up = { thumb?: boolean; index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean };

function makeHand(up: Up): Landmark[] {
  const pinkyMcp = along(DIRS.pinky, 0.09);
  // El pulgar se abre hacia el lado contrario al meñique.
  const thumbAt = (d: number): Landmark => ({ x: pinkyMcp.x - d, y: pinkyMcp.y });

  const finger = (dir: readonly [number, number] | number[], open?: boolean) => [
    along(dir, 0.09), // MCP
    along(dir, 0.15), // PIP
    along(dir, 0.19), // DIP
    along(dir, open ? EXTENDED : CURLED), // TIP
  ];

  return [
    WRIST,
    thumbAt(0.08), thumbAt(0.14), // CMC, MCP
    thumbAt(0.2), // IP
    thumbAt(up.thumb ? 0.3 : 0.15), // TIP
    ...finger(DIRS.index, up.index),
    ...finger(DIRS.middle, up.middle),
    ...finger(DIRS.ring, up.ring),
    ...finger(DIRS.pinky, up.pinky),
  ];
}

const HANDS: Record<Gesture, Landmark[]> = {
  uno: makeHand({ index: true }),
  dos: makeHand({ index: true, middle: true }),
  tres: makeHand({ index: true, middle: true, ring: true }),
  cuatro: makeHand({ index: true, middle: true, ring: true, pinky: true }),
  palma: makeHand({ thumb: true, index: true, middle: true, ring: true, pinky: true }),
};

function rotate(lm: Landmark[], deg: number): Landmark[] {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  return lm.map((p) => {
    const dx = p.x - WRIST.x, dy = p.y - WRIST.y;
    return { x: WRIST.x + dx * cos - dy * sin, y: WRIST.y + dx * sin + dy * cos };
  });
}

// ── Vocabulario ─────────────────────────────────────────────────────────────────────────
describe("fingersUp", () => {
  it("cuenta bien los dedos de cada gesto", () => {
    expect(fingersUp(HANDS.uno)).toEqual({ thumb: false, index: true, middle: false, ring: false, pinky: false });
    expect(fingersUp(HANDS.dos)).toEqual({ thumb: false, index: true, middle: true, ring: false, pinky: false });
    expect(fingersUp(HANDS.palma)).toEqual({ thumb: true, index: true, middle: true, ring: true, pinky: true });
  });

  it("no adivina con datos incompletos", () => {
    expect(fingersUp([])).toBeNull();
    expect(fingersUp(HANDS.uno.slice(0, 10))).toBeNull();
  });
});

describe("gestureFrom", () => {
  it("reconoce los cinco gestos del vocabulario", () => {
    for (const g of Object.keys(HANDS) as Gesture[]) {
      expect(gestureFrom(HANDS[g]), `falló ${GESTURE_LABEL[g]}`).toBe(g);
    }
  });

  it("aguanta la mano ladeada (nadie la mantiene perfectamente vertical)", () => {
    for (const deg of [-35, -15, 15, 35]) {
      expect(gestureFrom(rotate(HANDS.dos, deg)), `falló a ${deg}°`).toBe("dos");
      expect(gestureFrom(rotate(HANDS.palma, deg)), `falló a ${deg}°`).toBe("palma");
    }
  });

  it("ignora las combinaciones que no significan nada", () => {
    expect(gestureFrom(makeHand({}))).toBeNull(); // puño
    expect(gestureFrom(makeHand({ pinky: true }))).toBeNull(); // meñique solo
    expect(gestureFrom(makeHand({ index: true, pinky: true }))).toBeNull(); // cuernos
    expect(gestureFrom(makeHand({ thumb: true }))).toBeNull(); // pulgar arriba
  });

  it("no interpreta una mano cortada por el borde del cuadro", () => {
    const fuera = HANDS.dos.map((p) => ({ ...p, y: p.y + 0.32 })); // se sale por abajo
    expect(handFullyVisible(fuera)).toBe(false);
    expect(gestureFrom(fuera)).toBeNull();
  });

  it("distingue 'cuatro' de 'palma' solo por el pulgar", () => {
    expect(gestureFrom(HANDS.cuatro)).toBe("cuatro");
    expect(gestureFrom(HANDS.palma)).toBe("palma");
  });
});

describe("commandForGesture", () => {
  it("los dedos mandan a la tarea del dock y la palma pausa", () => {
    expect(commandForGesture("uno")).toEqual({ kind: "switch", index: 0 });
    expect(commandForGesture("cuatro")).toEqual({ kind: "switch", index: 3 });
    expect(commandForGesture("palma")).toEqual({ kind: "pause" });
  });
});

// ── Estabilizador ───────────────────────────────────────────────────────────────────────
// Alimentamos cuadros a mano para verificar las tres defensas contra el falso positivo.
const feedFor = (
  st: ReturnType<typeof createStabilizer>,
  g: Gesture | null,
  ms: number,
  t0 = 0,
  step = 80,
) => {
  let last = { candidate: null as Gesture | null, progress: 0, fire: null as Gesture | null, cooling: false };
  const fires: Gesture[] = [];
  for (let t = t0; t < t0 + ms; t += step) {
    last = st.feed(g, t);
    if (last.fire) fires.push(last.fire);
  }
  return { last, fires, endT: t0 + ms };
};

describe("stabilizer", () => {
  it("no dispara con un gesto suelto: hay que sostenerlo", () => {
    const st = createStabilizer();
    const { fires } = feedFor(st, "uno", 600); // menos del dwell
    expect(fires).toHaveLength(0);
  });

  it("dispara una sola vez al completar el dwell", () => {
    const st = createStabilizer();
    const { fires } = feedFor(st, "uno", 2000);
    expect(fires).toEqual(["uno"]);
  });

  it("sostener la mano NO repite el comando en bucle", () => {
    const st = createStabilizer();
    const { fires } = feedFor(st, "palma", 12_000); // diez segundos con la palma quieta
    expect(fires).toEqual(["palma"]);
  });

  it("hay que soltar y volver a hacer el gesto para repetirlo", () => {
    const st = createStabilizer();
    const a = feedFor(st, "uno", 2000);
    expect(a.fires).toEqual(["uno"]);
    const b = feedFor(st, null, 1500, a.endT); // suelta
    const c = feedFor(st, "uno", 2000, b.endT); // lo vuelve a hacer
    expect(c.fires).toEqual(["uno"]);
  });

  it("un parpadeo del modelo no cuenta como gesto", () => {
    const st = createStabilizer();
    // Mano quieta en "dos" con un cuadro suelto mal leído: debe seguir siendo "dos".
    let out = st.feed("dos", 0);
    for (let i = 1; i < 20; i++) out = st.feed(i === 7 ? "tres" : "dos", i * 80);
    expect(out.fire ?? "dos").toBe("dos");
  });

  it("cambiar de gesto a media cuenta reinicia el progreso", () => {
    const st = createStabilizer();
    feedFor(st, "uno", 800);
    const { fires, last } = feedFor(st, "dos", 400, 800);
    expect(fires).toHaveLength(0);
    expect(last.progress).toBeLessThan(1);
  });

  it("el progreso avanza de 0 a 1 (es lo que pinta el anillo)", () => {
    const st = createStabilizer();
    for (let t = 0; t < 700; t += 80) st.feed("tres", t);
    const mid = st.feed("tres", 700);
    expect(mid.progress).toBeGreaterThan(0.4);
    expect(mid.progress).toBeLessThan(1);
  });

  it("una mano que no hace ningún gesto conocido no arma nada", () => {
    const st = createStabilizer();
    const { fires, last } = feedFor(st, null, 3000);
    expect(fires).toHaveLength(0);
    expect(last.candidate).toBeNull();
  });

  it("reset deja el estabilizador como nuevo", () => {
    const st = createStabilizer();
    feedFor(st, "uno", 1000);
    st.reset();
    const { fires } = feedFor(st, "uno", 600, 1000);
    expect(fires).toHaveLength(0); // vuelve a exigir el dwell completo
  });
});
