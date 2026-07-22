import { describe, it, expect } from "vitest";
import { computePulse, bandOf, teamPulse, type PulseRecord } from "@/lib/pulse";
import type { Task } from "@/lib/mock-data";

// El Pulso es la métrica insignia y la más delicada del producto: califica implícitamente a
// una persona. El principio es "acompañar, no sancionar" (regla 5 de AGENTS.md), así que lo
// que más importa probar es que NO invente números cuando no hay datos.

const LUNES = new Date(2026, 6, 20, 12, 0, 0).getTime(); // lunes 20 jul 2026
const MIERCOLES = new Date(2026, 6, 22, 12, 0, 0).getTime();
const dia = (d: number, h = 10) => new Date(2026, 6, d, h, 0, 0).toISOString();

const r = (start: string, minutes: number, inactiveMinutes = 0): PulseRecord => ({
  taskId: "a", start, minutes, inactiveMinutes,
});

const task = (over: Partial<Task> & { id: string }): Task => ({
  name: "T", responsableId: "andres", clientId: "c1", projectId: "p1", typeId: "t1",
  status: "En curso", baselineSeconds: 0, ...over,
});

describe("computePulse — semana sin datos", () => {
  it("no reporta minutos ni días activos si no se midió nada", () => {
    const p = computePulse([], [], MIERCOLES);
    expect(p.weekMinutes).toBe(0);
    expect(p.activeDays).toBe(0);
    expect(p.streak).toBe(0);
  });

  it("dice qué hacer en vez de calificar (weekMinutes 0 es la señal que la UI pinta neutra)", () => {
    const p = computePulse([], [], MIERCOLES);
    expect(p.headline).toMatch(/Aún no registras tiempo/i);
  });

  it("los registros de semanas pasadas no cuentan como semana en curso", () => {
    const p = computePulse([r(dia(13), 300)], [], MIERCOLES); // lunes anterior
    expect(p.weekMinutes).toBe(0);
  });
});

describe("computePulse — semana con datos", () => {
  it("suma solo los minutos de la semana en curso y cuenta los días hábiles activos", () => {
    const p = computePulse(
      [r(dia(20), 120), r(dia(21), 60), r(dia(21, 16), 30), r(dia(13), 999)],
      [], MIERCOLES,
    );
    expect(p.weekMinutes).toBe(210);
    expect(p.activeDays).toBe(2); // lunes y martes
  });

  it("el foco baja cuando hay mucho tiempo inactivo", () => {
    const enfocado = computePulse([r(dia(20), 100, 0)], [], MIERCOLES);
    const disperso = computePulse([r(dia(20), 100, 50)], [], MIERCOLES);
    expect(enfocado.components.F).toBe(1);
    expect(disperso.components.F).toBe(0);
    expect(disperso.score).toBeLessThan(enfocado.score);
  });

  it("el cumplimiento baja con tareas vencidas y no castiga a quien no tiene fechas", () => {
    const vencida = task({ id: "v", dueDate: "2026-07-01" });
    const alDia = task({ id: "d", dueDate: "2026-12-01" });
    const sinFechas = computePulse([r(dia(20), 60)], [], MIERCOLES);
    const conVencida = computePulse([r(dia(20), 60)], [vencida, alDia], MIERCOLES);
    expect(sinFechas.components.K).toBe(0.75); // neutro, no 0
    expect(conVencida.components.K).toBe(0.5);
  });

  it("las tareas terminadas no cuentan como vencidas", () => {
    const p = computePulse(
      [r(dia(20), 60)],
      [task({ id: "v", dueDate: "2026-07-01", status: "Done" })],
      MIERCOLES,
    );
    expect(p.components.K).toBe(0.75); // no quedan tareas abiertas con fecha
  });

  it("el score siempre cae en 0-100 y la banda concuerda", () => {
    const p = computePulse([r(dia(20), 480), r(dia(21), 480), r(dia(22), 480)], [], MIERCOLES);
    expect(p.score).toBeGreaterThanOrEqual(0);
    expect(p.score).toBeLessThanOrEqual(100);
    expect(p.band).toBe(bandOf(p.score));
  });

  it("el lunes temprano ya cuenta como semana nueva", () => {
    const p = computePulse([r(dia(20, 9), 45)], [], LUNES);
    expect(p.weekMinutes).toBe(45);
  });
});

describe("bandOf", () => {
  it("corta en 50 y 75", () => {
    expect(bandOf(49)).toBe("low");
    expect(bandOf(50)).toBe("mid");
    expect(bandOf(74)).toBe("mid");
    expect(bandOf(75)).toBe("high");
  });
});

describe("teamPulse", () => {
  it("promedia solo a quienes trabajaron (un 0 no arrastra al equipo)", () => {
    const t = teamPulse([80, 60, 0]);
    expect(t.avg).toBe(70);
    expect(t.dist).toEqual({ low: 0, mid: 1, high: 1 });
  });

  it("sin nadie activo devuelve 0 y distribución vacía", () => {
    expect(teamPulse([]).avg).toBe(0);
    expect(teamPulse([0, 0]).dist).toEqual({ low: 0, mid: 0, high: 0 });
  });
});
