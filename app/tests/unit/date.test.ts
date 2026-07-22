import { describe, it, expect } from "vitest";
import { parseDateOnly, dueDateMs, dueDateLabel, mondayOf, firstDayOfMonth } from "@/lib/date";

// Estas pruebas existen por un bug REAL: `new Date("2026-07-15")` se interpreta como UTC
// medianoche, así que en México (UTC-6) una tarea que vencía HOY se mostraba y contaba como
// si venciera AYER. Corren con TZ=America/Mexico_City (ver vitest.config.ts) justo para que
// un runner en UTC no las deje pasar de largo.
describe("parseDateOnly", () => {
  it("interpreta una fecha date-only de Notion como fecha LOCAL, no UTC", () => {
    const d = parseDateOnly("2026-07-15")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // julio
    expect(d.getDate()).toBe(15); // el bug daba 14 en México
    expect(d.getHours()).toBe(0);
  });

  it("respeta las fechas que sí traen hora", () => {
    const d = parseDateOnly("2026-07-15T18:30:00.000Z")!;
    expect(d.getTime()).toBe(Date.parse("2026-07-15T18:30:00.000Z"));
  });

  it("devuelve null cuando no hay fecha", () => {
    expect(parseDateOnly(undefined)).toBeNull();
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly("")).toBeNull();
  });
});

describe("dueDateMs / dueDateLabel", () => {
  it("una tarea que vence hoy cae dentro del día local de hoy", () => {
    const hoy = new Date();
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const t0 = new Date().setHours(0, 0, 0, 0);
    const ms = dueDateMs(iso)!;
    expect(ms).toBeGreaterThanOrEqual(t0);
    expect(ms).toBeLessThan(t0 + 86_400_000);
  });

  it("etiqueta el día correcto (no el anterior)", () => {
    expect(dueDateLabel("2026-07-01")).toBe("1 jul");
    expect(dueDateLabel("2026-01-31")).toBe("31 ene");
  });
});

describe("mondayOf", () => {
  it("el lunes de una semana es ese mismo lunes a las 00:00", () => {
    const lunes = mondayOf(new Date(2026, 6, 20, 15, 30)); // lunes 20 jul 2026
    expect(lunes.getDate()).toBe(20);
    expect(lunes.getHours()).toBe(0);
  });

  it("el domingo pertenece a la semana que empezó el lunes anterior (semana L→D)", () => {
    const lunes = mondayOf(new Date(2026, 6, 26, 23, 0)); // domingo 26 jul 2026
    expect(lunes.getDate()).toBe(20);
  });
});

describe("firstDayOfMonth", () => {
  it("normaliza al día 1 a las 00:00", () => {
    const f = firstDayOfMonth(new Date(2026, 6, 22, 9, 12));
    expect(f.getDate()).toBe(1);
    expect(f.getMonth()).toBe(6);
    expect(f.getHours()).toBe(0);
  });
});
