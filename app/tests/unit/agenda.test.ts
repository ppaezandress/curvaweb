import { describe, it, expect } from "vitest";
import {
  buildAgenda, dayLabel, untilLabel, progressOf, minutesLabel,
  buildMonthGrid, monthGridRange, shiftMonth, meetingsOn, type AgendaEvent,
} from "@/lib/agenda";

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

describe("calendario (rejilla de mes)", () => {
  // Ancla dentro de julio 2026 (miércoles 15).
  const JULY = new Date(2026, 6, 15, 10, 0, 0).getTime();

  it("la rejilla es 6×7, empieza en lunes y etiqueta el mes capitalizado", () => {
    const g = buildMonthGrid([], JULY, JULY);
    expect(g.weeks).toHaveLength(6);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect(g.weekdays[0]).toBe("L");
    expect(g.label).toBe("Julio 2026");
    // Julio 2026 empieza en miércoles → la 1a celda (lunes) es 29 jun, fuera de mes.
    expect(g.weeks[0][0].inMonth).toBe(false);
    expect(g.weeks[0][0].day).toBe(29);
    // El día 1 de julio cae en la 1a semana, columna del miércoles (índice 2).
    expect(g.weeks[0][2]).toMatchObject({ day: 1, inMonth: true });
  });

  it("marca hoy y cuenta las juntas por día", () => {
    const at = (d: number, h: number) => new Date(2026, 6, d, h, 0, 0).getTime();
    const ev = (id: string, d: number, h: number): AgendaEvent => ({ id, title: id, start: at(d, h), end: at(d, h) + 3_600_000, attendees: [] });
    const g = buildMonthGrid([ev("a", 15, 9), ev("b", 15, 14), ev("c", 16, 10)], JULY, JULY);
    const cell = (day: number) => g.weeks.flat().find((c) => c.inMonth && c.day === day)!;
    expect(cell(15).isToday).toBe(true);
    expect(cell(15).count).toBe(2);
    expect(cell(16).count).toBe(1);
    expect(cell(17).count).toBe(0);
  });

  it("monthGridRange cubre 42 días desde el lunes anterior al día 1", () => {
    const { from, to } = monthGridRange(JULY);
    expect(new Date(from).getDate()).toBe(29); // lunes 29 jun
    expect(new Date(from).getMonth()).toBe(5); // junio
    expect(Math.round((to - from) / 86_400_000)).toBe(42);
  });

  it("shiftMonth navega meses fijando el día 1", () => {
    const prev = shiftMonth(JULY, -1);
    const next = shiftMonth(JULY, 1);
    expect(new Date(prev).getMonth()).toBe(5); // junio
    expect(new Date(next).getMonth()).toBe(7); // agosto
    expect(new Date(next).getDate()).toBe(1);
  });

  it("meetingsOn devuelve las juntas del día ordenadas", () => {
    const at = (d: number, h: number) => new Date(2026, 6, d, h, 0, 0).getTime();
    const ev = (id: string, d: number, h: number): AgendaEvent => ({ id, title: id, start: at(d, h), end: at(d, h) + 3_600_000, attendees: [] });
    const evs = [ev("tarde", 15, 16), ev("otro-dia", 16, 9), ev("mañana", 15, 8)];
    expect(meetingsOn(evs, at(15, 0)).map((e) => e.id)).toEqual(["mañana", "tarde"]);
  });
});
