import { describe, it, expect } from "vitest";
import { computeThresholds, DEFAULT_THRESHOLDS, type Sample } from "@/lib/gestures/calibration";

// La calibración existe porque ajustar umbrales "a ojo" no converge: lo que le sirve a una
// persona le falla a la siguiente. Aquí se comprueba que aprender de dos posturas produce
// cortes sensatos, y que una medición mala se rechaza en vez de dejar el sistema peor.

const samples = (fingers: number, thumb: number, scale: number, n = 20): Sample[] =>
  Array.from({ length: n }, (_, i) => ({
    // Ruido pequeño, como el de una mano real sostenida.
    fingers: [fingers, fingers + 0.01, fingers - 0.01, fingers].map((v) => v + (i % 3) * 0.002),
    thumb: thumb + (i % 3) * 0.01,
    scale: scale + (i % 3) * 0.002,
  }));

describe("computeThresholds", () => {
  it("pone el corte entre lo que de verdad hace la persona", () => {
    const t = computeThresholds(samples(1.35, 1.6, 0.22), samples(0.95, 0.5, 0.2))!;
    expect(t).not.toBeNull();
    expect(t.openRatio).toBeLessThan(1.35); // por debajo de su mano abierta
    expect(t.closedRatio).toBeGreaterThan(0.95); // por encima de su puño
    expect(t.openRatio).toBeGreaterThan(t.closedRatio);
  });

  it("aprende a qué distancia presenta la mano esa persona", () => {
    const cerca = computeThresholds(samples(1.35, 1.6, 0.30), samples(0.95, 0.5, 0.28))!;
    const lejos = computeThresholds(samples(1.35, 1.6, 0.16), samples(0.95, 0.5, 0.15))!;
    expect(cerca.minPresentScale).toBeGreaterThan(lejos.minPresentScale);
    // Y siempre por debajo de como la enseñó, para no rechazar su postura natural.
    expect(lejos.minPresentScale).toBeLessThan(0.16);
  });

  it("rechaza una calibración donde las dos posturas salieron iguales", () => {
    // Pasa si alguien no cambió de postura o la cámara no lo vio.
    expect(computeThresholds(samples(1.2, 1.2, 0.2), samples(1.19, 1.19, 0.2))).toBeNull();
  });

  it("rechaza una calibración con muy pocas muestras", () => {
    expect(computeThresholds(samples(1.35, 1.6, 0.22, 2), samples(0.95, 0.5, 0.2, 2))).toBeNull();
  });

  it("nunca devuelve umbrales absurdos, aunque la medición sea extrema", () => {
    const t = computeThresholds(samples(9, 9, 0.9), samples(0.01, 0.01, 0.01))!;
    expect(t.openRatio).toBeLessThanOrEqual(1.6);
    expect(t.closedRatio).toBeGreaterThanOrEqual(0.85);
    expect(t.minPresentScale).toBeLessThanOrEqual(0.35);
    expect(t.minPresentScale).toBeGreaterThanOrEqual(0.05);
  });

  it("un cuadro raro no arrastra el resultado (se usa la mediana)", () => {
    const conRuido = [...samples(1.35, 1.6, 0.22), { fingers: [99, 99, 99, 99], thumb: 99, scale: 99 }];
    const t = computeThresholds(conRuido, samples(0.95, 0.5, 0.2))!;
    expect(t.openRatio).toBeLessThan(1.4);
  });

  it("los valores de fábrica son un punto de partida válido", () => {
    expect(DEFAULT_THRESHOLDS.openRatio).toBeGreaterThan(DEFAULT_THRESHOLDS.closedRatio);
    expect(DEFAULT_THRESHOLDS.thumbFar).toBeGreaterThan(DEFAULT_THRESHOLDS.thumbNear);
  });
});
