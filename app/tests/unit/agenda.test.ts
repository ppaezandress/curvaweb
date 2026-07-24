import { describe, it, expect } from "vitest";
import { buildAgenda, dayLabel, untilLabel, progressOf, minutesLabel, type AgendaEvent } from "@/lib/agenda";

// Corre en America/Mexico_City (vitest config) para atrapar bugs de día local.
const DAY_START = new Date(2026, 6, 15, 0, 0, 0, 0).getTime(); // miércoles 15 jul 2026, local
const at = (h: number, m = 0) => DAY_START + h * 3_600_000 + m * 60_000;
const NOW = at(12); // mediodía

const ev = (over: Partial<AgendaEvent> & { id: string; start: number; end: number }): AgendaEvent => ({
  title: `Junta ${over.id}`, attendees: [], ...over,
});

describe("buildAgenda", () => {
  it("detecta la junta en curso", () => {
    const v = buildAgenda([ev({ id: "live", start: at(11, 30), end: at(12, 30) })], NOW);
    expect(v.live?.id).toBe("live");
    expect(v.next).toBeNull();
  });

  it("detecta la próxima junta (aún no empieza)", () => {
    const v = buildAgenda([
      ev({ id: "ya", start: at(9), end: at(10) }), // terminó hace rato → fuera
      ev({ id: "prox", start: at(14), end: at(15) }),
    ], NOW);
    expect(v.live).toBeNull();
    expect(v.next?.id).toBe("prox");
  });

  it("descarta juntas que terminaron hace más de 15 min", () => {
    const v = buildAgenda([ev({ id: "vieja", start: at(10), end: at(11, 40) })], NOW);
    expect(v.total).toBe(0);
    expect(v.days).toHaveLength(0);
  });

  it("mantiene una junta recién terminada dentro de la gracia de 15 min", () => {
    const v = buildAgenda([ev({ id: "recien", start: at(11), end: at(11, 50) })], NOW);
    expect(v.total).toBe(1);
  });

  it("con varias en curso solapadas, elige la que termina primero", () => {
    const v = buildAgenda([
      ev({ id: "larga", start: at(11), end: at(13) }),
      ev({ id: "corta", start: at(11, 45), end: at(12, 15) }),
    ], NOW);
    expect(v.live?.id).toBe("corta");
  });

  it("agrupa por día y calcula conteo y minutos ocupados", () => {
    const v = buildAgenda([
      ev({ id: "a", start: at(13), end: at(14) }), // hoy, 60 min
      ev({ id: "b", start: at(15), end: at(15, 30) }), // hoy, 30 min
      ev({ id: "c", start: at(24 + 10), end: at(24 + 11) }), // mañana, 60 min
    ], NOW);
    expect(v.days).toHaveLength(2);
    expect(v.days[0].isToday).toBe(true);
    expect(v.days[0].count).toBe(2);
    expect(v.days[0].busyMin).toBe(90);
    expect(v.days[1].label).toBe("Mañana");
  });

  it("calcula el hueco libre antes de una junta (mismo día)", () => {
    const v = buildAgenda([
      ev({ id: "a", start: at(13), end: at(14) }),
      ev({ id: "b", start: at(16), end: at(17) }), // 2 h después
    ], NOW);
    expect(v.days[0].meetings[0].gapBeforeMin).toBe(0); // la primera no tiene hueco antes
    expect(v.days[0].meetings[1].gapBeforeMin).toBe(120);
  });

  it("no revienta sin eventos", () => {
    const v = buildAgenda([], NOW);
    expect(v).toEqual({ live: null, next: null, days: [], total: 0 });
    expect(buildAgenda(undefined as unknown as AgendaEvent[], NOW).total).toBe(0);
  });
});

describe("dayLabel", () => {
  it("Hoy / Mañana / fecha", () => {
    expect(dayLabel(at(15), NOW)).toBe("Hoy");
    expect(dayLabel(at(24 + 9), NOW)).toBe("Mañana");
    expect(dayLabel(at(48 + 9), NOW)).toMatch(/jul/); // "vie 17 jul"
  });
});

describe("untilLabel", () => {
  it("formatea la cuenta regresiva", () => {
    expect(untilLabel(NOW, NOW)).toBe("ahora");
    expect(untilLabel(at(12, 25), NOW)).toBe("en 25 min");
    expect(untilLabel(at(14, 10), NOW)).toBe("en 2 h 10 min");
    expect(untilLabel(at(14), NOW)).toBe("en 2 h");
  });
});

describe("progressOf", () => {
  it("0 al inicio, 0.5 a la mitad, 1 al final (clamp)", () => {
    const e = ev({ id: "x", start: at(11), end: at(13) }); // 2 h
    expect(progressOf(e, at(11))).toBe(0);
    expect(progressOf(e, at(12))).toBeCloseTo(0.5, 5);
    expect(progressOf(e, at(14))).toBe(1); // clamp
  });
});

describe("minutesLabel", () => {
  it("min y horas", () => {
    expect(minutesLabel(45)).toBe("45 min");
    expect(minutesLabel(60)).toBe("1 h");
    expect(minutesLabel(90)).toBe("1 h 30 min");
  });
});
