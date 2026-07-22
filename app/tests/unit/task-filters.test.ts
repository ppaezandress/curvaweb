import { describe, it, expect } from "vitest";
import { inDateRange, DATE_RANGES } from "@/lib/task-filters";

// Los filtros de fecha alimentan /tareas y el tablero "Para hoy". Ya hubo una queja real
// (Emiliano) de que "solo se ve una tarea de hoy": todo lo que se filtra mal aquí se traduce
// en gente que no ve su trabajo del día.

const HOY = new Date(2026, 6, 22, 15, 0, 0).getTime(); // miércoles 22 jul 2026, 15:00

describe("inDateRange", () => {
  it("'todos' no filtra nada, ni siquiera lo que no tiene fecha", () => {
    expect(inDateRange("2020-01-01", "todos", HOY)).toBe(true);
    expect(inDateRange(undefined, "todos", HOY)).toBe(true);
  });

  it("una tarea que vence HOY es de hoy, no de vencidas", () => {
    expect(inDateRange("2026-07-22", "hoy", HOY)).toBe(true);
    expect(inDateRange("2026-07-22", "vencidas", HOY)).toBe(false);
  });

  it("lo de ayer está vencido", () => {
    expect(inDateRange("2026-07-21", "vencidas", HOY)).toBe(true);
    expect(inDateRange("2026-07-21", "hoy", HOY)).toBe(false);
  });

  it("mañana es mañana", () => {
    expect(inDateRange("2026-07-23", "manana", HOY)).toBe(true);
    expect(inDateRange("2026-07-22", "manana", HOY)).toBe(false);
    expect(inDateRange("2026-07-24", "manana", HOY)).toBe(false);
  });

  it("'esta semana' va de lunes a domingo e incluye lo ya vencido de la semana", () => {
    expect(inDateRange("2026-07-20", "semana", HOY)).toBe(true); // lunes
    expect(inDateRange("2026-07-26", "semana", HOY)).toBe(true); // domingo
    expect(inDateRange("2026-07-27", "semana", HOY)).toBe(false); // lunes siguiente
    expect(inDateRange("2026-07-19", "semana", HOY)).toBe(false); // domingo anterior
  });

  it("'próxima semana' es la siguiente completa, sin traslape", () => {
    expect(inDateRange("2026-07-27", "prox_semana", HOY)).toBe(true);
    expect(inDateRange("2026-08-02", "prox_semana", HOY)).toBe(true);
    expect(inDateRange("2026-08-03", "prox_semana", HOY)).toBe(false);
    expect(inDateRange("2026-07-26", "prox_semana", HOY)).toBe(false);
  });

  it("'este mes' cubre el mes natural completo", () => {
    expect(inDateRange("2026-07-01", "mes", HOY)).toBe(true);
    expect(inDateRange("2026-07-31", "mes", HOY)).toBe(true);
    expect(inDateRange("2026-08-01", "mes", HOY)).toBe(false);
  });

  it("'próximo mes' es agosto completo y nada más", () => {
    expect(inDateRange("2026-08-01", "prox_mes", HOY)).toBe(true);
    expect(inDateRange("2026-08-31", "prox_mes", HOY)).toBe(true);
    expect(inDateRange("2026-09-01", "prox_mes", HOY)).toBe(false);
    expect(inDateRange("2026-07-31", "prox_mes", HOY)).toBe(false);
  });

  it("'sin fecha' agarra exactamente las que no tienen due date", () => {
    expect(inDateRange(undefined, "sin_fecha", HOY)).toBe(true);
    expect(inDateRange(null, "sin_fecha", HOY)).toBe(true);
    expect(inDateRange("2026-07-22", "sin_fecha", HOY)).toBe(false);
  });

  it("una tarea sin fecha nunca aparece en un rango con fecha", () => {
    for (const { key } of DATE_RANGES) {
      if (key === "todos" || key === "sin_fecha") continue;
      expect(inDateRange(undefined, key, HOY)).toBe(false);
    }
  });

  it("cruzando fin de mes, 'mañana' sigue funcionando", () => {
    const finDeMes = new Date(2026, 6, 31, 20, 0, 0).getTime();
    expect(inDateRange("2026-08-01", "manana", finDeMes)).toBe(true);
  });
});
