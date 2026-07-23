import { describe, it, expect } from "vitest";
import {
  gestureFrom, gestureFromHands, fingersUp, handFullyVisible, commandForGesture, GESTURE_LABEL,
  type Landmark, type Gesture,
} from "@/lib/gestures/vocabulary";
import { createStabilizer } from "@/lib/gestures/stabilizer";
import { frameIntervalMs } from "@/lib/gestures/metronome";
import { SENSITIVITY } from "@/lib/gesture-prefs";

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
  // El pulgar, como en una mano de verdad: abierto se va al lado, y recogido CRUZA sobre la
  // palma quedando casi encima del nudillo del índice. La versión anterior lo dejaba siempre
  // separado, y por eso no distinguía uno de otro.
  const indexMcp = along(DIRS.index, 0.09);
  const thumbTip: Landmark = up.thumb
    ? { x: indexMcp.x - 0.16, y: indexMcp.y + 0.02 }
    : { x: indexMcp.x + 0.03, y: indexMcp.y + 0.02 };
  const lerp = (t: number): Landmark => ({
    x: indexMcp.x + (thumbTip.x - indexMcp.x) * t + 0.02,
    y: indexMcp.y + (thumbTip.y - indexMcp.y) * t + 0.06,
  });

  const finger = (dir: readonly [number, number] | number[], open?: boolean) => [
    along(dir, 0.09), // MCP
    along(dir, 0.15), // PIP
    along(dir, 0.19), // DIP
    along(dir, open ? EXTENDED : CURLED), // TIP
  ];

  return [
    WRIST,
    lerp(0.2), lerp(0.5), // CMC, MCP
    lerp(0.75), // IP
    thumbTip,
    ...finger(DIRS.index, up.index),
    ...finger(DIRS.middle, up.middle),
    ...finger(DIRS.ring, up.ring),
    ...finger(DIRS.pinky, up.pinky),
  ];
}

const HANDS: Record<Exclude<Gesture, "dosPalmas">, Landmark[]> = {
  uno: makeHand({ index: true }),
  dos: makeHand({ index: true, middle: true }),
  tres: makeHand({ index: true, middle: true, ring: true }),
  palma: makeHand({ thumb: true, index: true, middle: true, ring: true, pinky: true }),
};

// Cuatro dedos ya no significa nada (se confundía con tres y con la palma).
const CUATRO = makeHand({ index: true, middle: true, ring: true, pinky: true });

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
  it("reconoce los gestos de una mano", () => {
    for (const g of Object.keys(HANDS) as (keyof typeof HANDS)[]) {
      expect(gestureFrom(HANDS[g]), `falló ${GESTURE_LABEL[g]}`).toBe(g);
    }
  });

  it("aguanta la mano ladeada (nadie la mantiene perfectamente vertical)", () => {
    for (const deg of [-35, -15, 15, 35]) {
      expect(gestureFrom(rotate(HANDS.dos, deg)), `falló a ${deg}°`).toBe("dos");
      expect(gestureFrom(rotate(HANDS.palma, deg)), `falló a ${deg}°`).toBe("palma");
    }
  });

  it("cuenta CUÁNTOS dedos hay, no cuáles — cada quien cuenta como aprendió", () => {
    // Este es el bug que reportó el primer usuario real: en México el 3 se hace con
    // pulgar+índice+medio, no con índice+medio+anular. Exigir una combinación exacta era
    // pedirle a la gente que contara "como la app quiere".
    expect(gestureFrom(makeHand({ thumb: true, index: true, middle: true }))).toBe("tres");
    expect(gestureFrom(makeHand({ index: true, middle: true, ring: true }))).toBe("tres");

    expect(gestureFrom(makeHand({ thumb: true, index: true }))).toBe("dos"); // 2 a la mexicana
    expect(gestureFrom(makeHand({ index: true, middle: true }))).toBe("dos"); // 2 con la V

    expect(gestureFrom(makeHand({ pinky: true }))).toBe("uno"); // un dedo cualquiera
    expect(gestureFrom(makeHand({ index: true, pinky: true }))).toBe("dos"); // cuernos

  });

  it("el puño NO significa nada: es la postura natural de una mano en reposo", () => {
    // Usarlo como comando garantizaba disparos accidentales al bajar la mano o tomar el mouse.
    expect(gestureFrom(makeHand({}))).toBeNull();
  });

  it("cuatro dedos ya no significa nada: se confundía con tres y con la palma", () => {
    expect(gestureFrom(CUATRO)).toBeNull();
  });

  it("la palma entra aunque el pulgar no esté del todo claro", () => {
    // El caso reportado: "la palma casi no la agarra". El pulgar es el dedo que peor se lee, y
    // al quedar dudoso invalidaba el cuadro entero. Con los cuatro dedos largos abiertos la
    // intención es inequívoca, así que en la duda se resuelve como palma.
    const indexMcp = along(DIRS.index, 0.09);
    const conPulgarDudoso = makeHand({ index: true, middle: true, ring: true, pinky: true });
    // Pulgar a media apertura: ni sobre la palma ni claramente al lado.
    conPulgarDudoso[4] = { x: indexMcp.x - 0.085, y: indexMcp.y + 0.02 };
    expect(gestureFrom(conPulgarDudoso)).toBe("palma");
  });

  it("un solo dedo es la tarea 1, sea cual sea el dedo", () => {
    expect(gestureFrom(makeHand({ index: true }))).toBe("uno");
    expect(gestureFrom(makeHand({ thumb: true }))).toBe("uno");
  });

  it("no interpreta una mano cortada por el borde del cuadro", () => {
    const fuera = HANDS.dos.map((p) => ({ ...p, y: p.y + 0.32 })); // se sale por abajo
    expect(handFullyVisible(fuera)).toBe(false);
    expect(gestureFrom(fuera)).toBeNull();
  });

  it("la mano entera abierta es la palma", () => {
    expect(gestureFrom(HANDS.palma)).toBe("palma");
  });
});

describe("commandForGesture", () => {
  it("los dedos mandan a la tarea; una palma pausa y las dos reanudan", () => {
    expect(commandForGesture("uno")).toEqual({ kind: "switch", index: 0 });
    expect(commandForGesture("tres")).toEqual({ kind: "switch", index: 2 });
    expect(commandForGesture("palma")).toEqual({ kind: "pause" });
    expect(commandForGesture("dosPalmas")).toEqual({ kind: "resume" });
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

// ── Selección de mano cuando hay más de una en cuadro ────────────────────────────────────
// Pasa más seguido de lo que parece: la otra mano sobre el teclado, alguien pasando detrás.
// Mandamos la que se ve más grande (la que está más cerca de la cámara), que es la que te
// estás presentando a propósito.
describe("mano dominante", () => {
  const scale = (lm: Landmark[], k: number): Landmark[] =>
    lm.map((p) => ({ x: WRIST.x + (p.x - WRIST.x) * k, y: WRIST.y + (p.y - WRIST.y) * k }));

  const spanOf = (lm: Landmark[]) => {
    const xs = lm.map((p) => p.x), ys = lm.map((p) => p.y);
    return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  };

  it("la mano más cercana a la cámara ocupa más cuadro", () => {
    const cerca = HANDS.dos;
    const lejos = scale(HANDS.palma, 0.45);
    expect(spanOf(cerca)).toBeGreaterThan(spanOf(lejos));
  });

  it("una mano pequeña (alguien al fondo de la sala) se ignora", () => {
    // Antes se interpretaba igual que la tuya y podía moverte el cronómetro.
    expect(gestureFrom(scale(HANDS.palma, 0.5))).toBeNull();
    expect(gestureFrom(HANDS.palma)).toBe("palma");
  });
});

// ── Sensibilidad ────────────────────────────────────────────────────────────────────────
describe("sensibilidad configurable", () => {
  // Se usan los valores REALES de los ajustes: si alguien los cambia, estas pruebas dicen si
  // el cambio rompió la promesa de cada modo.
  it("en 'rápido' dispara antes que en 'tranquilo'", () => {
    const rapido = createStabilizer(SENSITIVITY.rapido);
    const tranquilo = createStabilizer(SENSITIVITY.tranquilo);
    const a = feedFor(rapido, "uno", 1000);
    const b = feedFor(tranquilo, "uno", 1000);
    expect(a.fires).toEqual(["uno"]);
    expect(b.fires).toHaveLength(0);
  });

  it("en 'tranquilo' un saludo de paso no alcanza a disparar", () => {
    const tranquilo = createStabilizer(SENSITIVITY.tranquilo);
    const { fires } = feedFor(tranquilo, "palma", 1200); // saludar dura menos que eso
    expect(fires).toHaveLength(0);
  });

  it("hasta el modo rápido exige sostener: un gesto de medio segundo no basta", () => {
    const rapido = createStabilizer(SENSITIVITY.rapido);
    const { fires } = feedFor(rapido, "palma", 400);
    expect(fires).toHaveLength(0);
  });
});

// ── Ritmo del reconocimiento ────────────────────────────────────────────────────────────
// De esto depende que los gestos sigan vivos cuando NO estás en la app (el caso que les da
// sentido) sin fundir la batería mirando una silla vacía.
describe("frameIntervalMs", () => {
  it("va más suave con la app a la vista que en segundo plano", () => {
    const visible = frameIntervalMs({ hidden: false, idle: false });
    const oculto = frameIntervalMs({ hidden: true, idle: false });
    expect(visible).toBeLessThan(oculto);
  });

  it("en segundo plano sigue siendo suficiente para completar una seña", () => {
    // Con el dwell más corto (0.8 s) y el estabilizador pidiendo 3 cuadros de acuerdo,
    // el ritmo de fondo tiene que dejar caber esos cuadros de sobra.
    const oculto = frameIntervalMs({ hidden: true, idle: false });
    expect(oculto * 3).toBeLessThan(800);
  });

  it("sin ninguna mano a la vista baja el ritmo, mire o no la app", () => {
    const idleVisible = frameIntervalMs({ hidden: false, idle: true });
    const idleOculto = frameIntervalMs({ hidden: true, idle: true });
    expect(idleVisible).toBe(idleOculto);
    expect(idleVisible).toBeGreaterThan(frameIntervalMs({ hidden: true, idle: false }));
  });

  it("un dwell completo cabe de sobra en cualquier ritmo activo", () => {
    for (const hidden of [true, false]) {
      const ms = frameIntervalMs({ hidden, idle: false });
      expect(1200 / ms).toBeGreaterThanOrEqual(3); // al menos 3 muestras en 1.2 s
    }
  });
});


// ── Precisión: la zona muerta ───────────────────────────────────────────────────────────
// Un dedo a medio estirar antes hacía parpadear el gesto entre 3 y 4 de un cuadro a otro.
// Ahora un dedo dudoso invalida el cuadro entero: mejor tardar un cuadro más que ejecutar
// el comando equivocado.
describe("dedos a medias", () => {
  const halfOpen = (dir: readonly [number, number] | number[]) => [
    along(dir, 0.09), along(dir, 0.15), along(dir, 0.17),
    along(dir, 0.165), // punta apenas más lejos que el nudillo: ni abierto ni cerrado
  ];

  function handWithHalfRing(): Landmark[] {
    const pinkyMcp = along(DIRS.pinky, 0.09);
    const thumbAt = (d: number): Landmark => ({ x: pinkyMcp.x - d, y: pinkyMcp.y });
    const finger = (dir: readonly [number, number] | number[], open?: boolean) => [
      along(dir, 0.09), along(dir, 0.15), along(dir, 0.19), along(dir, open ? 0.25 : 0.1),
    ];
    return [
      WRIST, thumbAt(0.08), thumbAt(0.14), thumbAt(0.2), thumbAt(0.15),
      ...finger(DIRS.index, true),
      ...finger(DIRS.middle, true),
      ...halfOpen(DIRS.ring), // el dudoso
      ...finger(DIRS.pinky, false),
    ];
  }

  it("no adivina cuando un dedo está a medias", () => {
    expect(fingersUp(handWithHalfRing())).toBeNull();
    expect(gestureFrom(handWithHalfRing())).toBeNull();
  });

  it("con los dedos claros sí decide", () => {
    expect(gestureFrom(HANDS.dos)).toBe("dos");
    expect(gestureFrom(HANDS.tres)).toBe("tres");
  });
});

// ── Las dos palmas ──────────────────────────────────────────────────────────────────────
// El gesto más seguro del vocabulario: hace falta tener las DOS manos libres y presentadas a
// la vez, cosa que no ocurre por accidente ni con el celular en la mano. Por eso es el que
// retoma el trabajo.
describe("dos palmas", () => {
  const otraMano = (lm: Landmark[]): Landmark[] => lm.map((p) => ({ ...p, x: p.x + 0.25 }));

  it("dos palmas abiertas a la vez son su propio gesto", () => {
    expect(gestureFromHands([HANDS.palma, otraMano(HANDS.palma)])).toBe("dosPalmas");
  });

  it("una sola palma sigue siendo pausar", () => {
    expect(gestureFromHands([HANDS.palma])).toBe("palma");
  });

  it("una palma y otra mano con dedos NO son dos palmas", () => {
    expect(gestureFromHands([HANDS.palma, otraMano(HANDS.dos)])).not.toBe("dosPalmas");
  });

  it("con dos manos distintas manda la que está más cerca de la cámara", () => {
    const lejana = otraMano(HANDS.dos).map((p) => ({ x: 0.75 + (p.x - 0.75) * 0.5, y: 0.72 + (p.y - 0.72) * 0.5 }));
    expect(gestureFromHands([HANDS.tres, lejana])).toBe("tres");
  });

  it("sin manos no hay gesto", () => {
    expect(gestureFromHands([])).toBeNull();
  });
});
