import { describe, it, expect } from "vitest";
import { createIntegrator, weightOf, DEFAULT_INTEGRATOR } from "@/lib/gestures/integrator";
import { SENSITIVITY } from "@/lib/gesture-prefs";
import { TUNING, SWITCH_DECAY } from "@/lib/gestures/tuning";

// El integrador decide cuándo una seña sostenida se vuelve una orden. Es donde se pagan los
// dos errores caros: ejecutar algo que nadie pidió, y no ejecutar lo que sí se pidió.

const alimentar = (
  st: ReturnType<typeof createIntegrator>,
  gesto: "uno" | "dos" | "palma" | null,
  ms: number,
  t0 = 0,
  conf = 0.9,
  paso = 50,
) => {
  const fires: string[] = [];
  let last = { candidate: null as string | null, progress: 0 };
  for (let t = t0; t < t0 + ms; t += paso) {
    const out = st.feed(gesto, gesto ? conf : 0, t);
    if (out.fire) fires.push(out.fire);
    last = { candidate: out.candidate, progress: out.progress };
  }
  return { fires, last, endT: t0 + ms };
};

describe("weightOf", () => {
  it("la evidencia pobre no avanza nada", () => {
    expect(weightOf(0)).toBe(0);
    expect(weightOf(TUNING.minConfidence - 0.01)).toBe(0);
  });

  it("la evidencia impecable avanza a velocidad plena", () => {
    expect(weightOf(TUNING.goodConfidence)).toBe(1);
    expect(weightOf(1)).toBe(1);
  });

  it("la evidencia regular avanza, pero cuesta", () => {
    const w = weightOf((TUNING.minConfidence + TUNING.goodConfidence) / 2);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
  });

  it("nunca corre más que el reloj: el tiempo de Ajustes es un mínimo real", () => {
    // Si una seña muy clara acelerara el disparo, "Tranquilo: 1.5 s" sería mentira justo para
    // quien lo eligió porque vive en videollamadas.
    for (const c of [0.8, 0.9, 1]) expect(weightOf(c)).toBeLessThanOrEqual(1);
  });
});

describe("sostener para ejecutar", () => {
  it("un gesto de paso no dispara", () => {
    const st = createIntegrator();
    expect(alimentar(st, "uno", 300).fires).toHaveLength(0);
  });

  it("sostenerlo el tiempo pedido sí", () => {
    const st = createIntegrator();
    expect(alimentar(st, "uno", 1200).fires).toEqual(["uno"]);
  });

  it("sostener la mano NO repite el comando en bucle", () => {
    const st = createIntegrator();
    expect(alimentar(st, "palma", 12_000).fires).toEqual(["palma"]);
  });

  it("hay que retirar la mano para dar otra orden", () => {
    const st = createIntegrator();
    const a = alimentar(st, "dos", 1200);
    expect(a.fires).toEqual(["dos"]);

    // Sin retirar: cambiar de postura no cuenta como orden nueva.
    const b = alimentar(st, "uno", 3000, a.endT);
    expect(b.fires).toEqual([]);

    // Retirando la mano un momento, sí.
    const c = alimentar(st, null, DEFAULT_INTEGRATOR.releaseMs + 400, b.endT);
    const d = alimentar(st, "uno", 1500, c.endT);
    expect(d.fires).toEqual(["uno"]);
  });

  it("la evidencia mala no dispara aunque se insista mucho rato", () => {
    const st = createIntegrator();
    expect(alimentar(st, "palma", 20_000, 0, TUNING.minConfidence - 0.05).fires).toEqual([]);
  });
});

describe("tolerancia a los parpadeos del modelo", () => {
  it("un cuadro perdido no borra el avance", () => {
    const st = createIntegrator();
    const a = alimentar(st, "palma", 600);
    const progresoAntes = a.last.progress;
    const b = alimentar(st, null, 50, a.endT); // un solo cuadro sin lectura
    expect(b.last.progress).toBeGreaterThan(progresoAntes * 0.7);
    expect(b.last.progress).toBeGreaterThan(0);
  });

  it("pero una seña distinta sostenida sí toma el relevo", () => {
    const st = createIntegrator();
    const a = alimentar(st, "palma", 600);
    const b = alimentar(st, "dos", 2000, a.endT);
    expect(b.fires).toEqual(["dos"]);
  });

  it("el descuento va por tiempo, no por cuadros: da igual el ritmo de análisis", () => {
    // Con el sistema anterior, "tolerar 3 cuadros" era 150 ms a 20/s y 250 ms a 12/s: la
    // función se comportaba distinto en primer y segundo plano sin que nada lo dijera.
    const rapido = createIntegrator();
    const lento = createIntegrator();
    const a = alimentar(rapido, "palma", 600, 0, 0.9, 50); // 20 cuadros/s
    const b = alimentar(lento, "palma", 600, 0, 0.9, 100); // 10 cuadros/s
    expect(Math.abs(a.last.progress - b.last.progress)).toBeLessThan(0.15);
    expect(SWITCH_DECAY).toBeGreaterThan(1);
  });
});

describe("sensibilidad configurable", () => {
  it("en 'rápido' dispara antes que en 'tranquilo'", () => {
    const rapido = createIntegrator(SENSITIVITY.rapido);
    const tranquilo = createIntegrator(SENSITIVITY.tranquilo);
    expect(alimentar(rapido, "uno", 700).fires).toEqual(["uno"]);
    expect(alimentar(tranquilo, "uno", 700).fires).toEqual([]);
  });

  it("en 'tranquilo' un saludo de paso no alcanza a disparar", () => {
    const st = createIntegrator(SENSITIVITY.tranquilo);
    expect(alimentar(st, "palma", 1200).fires).toEqual([]);
  });

  it("reset deja el integrador como nuevo", () => {
    const st = createIntegrator();
    alimentar(st, "uno", 600);
    st.reset();
    expect(alimentar(st, "uno", 400, 5000).fires).toEqual([]);
  });
});
