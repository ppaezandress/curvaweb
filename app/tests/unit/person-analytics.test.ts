import { describe, it, expect } from "vitest";
import { analyzePerson, sessionsOf, periodFor } from "@/lib/person-analytics";
import type { TimeRecord } from "@/lib/notion/fetchers";
import type { Task, Project, Client, TaskType } from "@/lib/mock-data";

// Este motor alimenta la vista con la que un socio mira a alguien del equipo. Si suma mal,
// alguien queda mal retratado — por eso se prueba el aislamiento por persona, el recorte por
// rango y que un registro se cuente igual que en el análisis del día.

const EMI = "Emiliano Lomba";
const OTRA = "Ivana Garduño";
// Lunes 20 jul 2026, 00:00 local.
const LUNES = new Date(2026, 6, 20).getTime();
const DAY = 86_400_000;
const at = (dayOffset: number, h: number, m = 0) => LUNES + dayOffset * DAY + h * 3_600_000 + m * 60_000;
const NOW = at(4, 18); // viernes 6pm

const task = (over: Partial<Task> & { id: string }): Task => ({
  name: `Tarea ${over.id}`, responsableId: "emi", clientId: "c1", projectId: "p1",
  typeId: "t1", status: "En curso", baselineSeconds: 0, ...over,
});

const maps = {
  taskById: {
    a: task({ id: "a" }),
    b: task({ id: "b", projectId: "p2", clientId: "c2" }),
    interna: task({ id: "interna", internal: true, projectId: "", clientId: "" }),
  } as Record<string, Task>,
  projectById: {
    p1: { id: "p1", name: "Rediseño Balmori", clientId: "c1" },
    p2: { id: "p2", name: "Onboarding ESFLO", clientId: "c2" },
  } as Record<string, Project>,
  clientById: {
    c1: { id: "c1", name: "Balmori", phase: "", status: "Activo" },
    c2: { id: "c2", name: "ESFLO", phase: "", status: "Activo" },
  } as Record<string, Client>,
  taskTypeById: {
    t1: { id: "t1", label: "Consultoría", color: "var(--color-curva-blue)" },
  } as Record<string, TaskType>,
};

const rec = (over: Omit<Partial<TimeRecord>, "start"> & { id: string; start: number; minutes: number }): TimeRecord => ({
  taskId: "a", person: EMI, inactiveMinutes: 0, mode: "manual",
  ...over,
  start: new Date(over.start).toISOString(),
});

const SEMANA = {
  from: LUNES,
  to: LUNES + 7 * DAY,
  prev: { from: LUNES - 7 * DAY, to: LUNES },
};

const RECORDS: TimeRecord[] = [
  // Emiliano: lunes 3h en Balmori, martes 2h en ESFLO, martes 1h interna, jueves 1.5h Balmori
  rec({ id: "1", start: at(0, 9), minutes: 180 }),
  rec({ id: "2", start: at(1, 10), minutes: 120, taskId: "b" }),
  rec({ id: "3", start: at(1, 16), minutes: 60, taskId: "interna" }),
  rec({ id: "4", start: at(3, 11), minutes: 90, inactiveMinutes: 9 }),
  // Semana pasada de Emiliano: 4h
  rec({ id: "5", start: at(-5, 10), minutes: 240 }),
  // De otra persona, misma semana: NO debe contarse
  rec({ id: "6", start: at(0, 9), minutes: 300, person: OTRA }),
];

const run = (extra: Partial<Parameters<typeof analyzePerson>[0]> = {}) =>
  analyzePerson({ records: RECORDS, person: EMI, ...SEMANA, now: NOW, ...extra }, maps);

describe("sessionsOf", () => {
  it("solo trae los registros de esa persona", () => {
    const s = sessionsOf(RECORDS, EMI, SEMANA.from, SEMANA.to, maps, NOW);
    expect(s.map((x) => x.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("recorta al rango pedido", () => {
    const s = sessionsOf(RECORDS, EMI, at(1, 0), at(2, 0), maps, NOW);
    expect(s.map((x) => x.id)).toEqual(["2", "3"]);
  });

  it("descarta lo fechado en el futuro", () => {
    const conFuturo = [...RECORDS, rec({ id: "futuro", start: at(6, 10), minutes: 999 })];
    const s = sessionsOf(conFuturo, EMI, SEMANA.from, SEMANA.to, maps, NOW);
    expect(s.some((x) => x.id === "futuro")).toBe(false);
  });

  it("resuelve proyecto y cliente de cada sesión", () => {
    const s = sessionsOf(RECORDS, EMI, SEMANA.from, SEMANA.to, maps, NOW);
    expect(s[0].project).toBe("Rediseño Balmori");
    expect(s[0].client).toBe("Balmori");
    expect(s[1].project).toBe("Onboarding ESFLO");
    expect(s[2].project).toBe("Interno");
    expect(s[2].billable).toBe(false);
  });
});

describe("analyzePerson — totales", () => {
  it("suma solo el tiempo de esa persona en el rango", () => {
    expect(run().totalMin).toBe(450); // 180 + 120 + 60 + 90
  });

  it("cuenta los días que de verdad trabajó", () => {
    const a = run();
    expect(a.activeDays).toBe(3); // lunes, martes, jueves
    expect(a.sessionCount).toBe(4);
  });

  it("da dos promedios distintos: por día trabajado y por día del calendario", () => {
    const a = run();
    expect(a.avgPerActiveDay).toBe(150); // 450 / 3 días con trabajo
    expect(a.avgPerCalendarDay).toBeLessThan(a.avgPerActiveDay); // el calendario incluye huecos
  });

  it("separa facturable de interno", () => {
    const a = run();
    expect(a.billableMin).toBe(390); // todo menos la hora interna
    expect(a.billablePct).toBe(87);
  });

  it("descuenta el tiempo inactivo del foco", () => {
    const a = run();
    expect(a.inactiveMin).toBe(9);
    expect(a.focusPct).toBe(98);
  });
});

describe("analyzePerson — en qué se fue el tiempo", () => {
  it("ordena los proyectos por tiempo, con su porcentaje", () => {
    const a = run();
    expect(a.byProject[0].label).toBe("Rediseño Balmori");
    expect(a.byProject[0].minutes).toBe(270);
    expect(a.byProject[0].pct).toBe(60);
    expect(a.byProject.map((g) => g.label)).toContain("Onboarding ESFLO");
  });

  it("agrupa por cliente y nombra el trabajo interno", () => {
    const a = run();
    const labels = a.byClient.map((g) => g.label);
    expect(labels).toContain("Balmori");
    expect(labels).toContain("ESFLO");
    expect(labels).toContain("Interno CURVA");
  });

  it("lista las tareas que más tiempo consumieron", () => {
    const a = run();
    expect(a.topTasks[0].minutes).toBe(270);
    expect(a.topTasks[0].sessions).toBe(2); // lunes + jueves en la misma tarea
    expect(a.topTasks[0].client).toBe("Balmori");
  });

  it("marca las juntas aparte del trabajo profundo", () => {
    const conJunta = [...RECORDS, rec({ id: "j", start: at(2, 12), minutes: 60, activity: "Junta con cliente" })];
    const a = run({ records: conJunta });
    expect(a.meetingMin).toBe(60);
    expect(a.deepMin).toBe(450);
  });
});

describe("analyzePerson — series", () => {
  it("da un punto por día transcurrido, incluidos los días en cero, sin pintar el futuro", () => {
    const a = run();
    // El rango es la semana completa, pero "ahora" es viernes: se pintan lunes→sábado y no
    // los días que todavía no ocurren (una barra en cero de un día futuro se lee como
    // "no trabajó", que es mentira).
    expect(a.byDay).toHaveLength(6);
    expect(a.byDay[0].minutes).toBe(180); // lunes
    expect(a.byDay[2].minutes).toBe(0); // miércoles sin trabajo
    expect(a.byDay[3].minutes).toBe(90); // jueves
  });

  it("agrupa por semana de lunes a domingo", () => {
    const a = analyzePerson(
      { records: RECORDS, person: EMI, from: LUNES - 14 * DAY, to: LUNES + 7 * DAY, now: NOW },
      maps,
    );
    expect(a.byWeek).toHaveLength(2); // la semana pasada y esta
    expect(a.byWeek[0].minutes).toBe(240);
    expect(a.byWeek[1].minutes).toBe(450);
  });

  it("señala el mejor día del rango", () => {
    expect(run().bestDay?.minutes).toBe(180);
  });
});

describe("analyzePerson — comparativa", () => {
  it("compara contra el periodo anterior", () => {
    const a = run();
    expect(a.prevTotalMin).toBe(240);
    expect(a.deltaPct).toBe(88); // de 4h a 7.5h
  });

  it("sin periodo anterior con datos, no inventa un porcentaje", () => {
    const a = analyzePerson(
      { records: RECORDS, person: EMI, from: LUNES, to: LUNES + 7 * DAY, prev: { from: LUNES - 60 * DAY, to: LUNES - 50 * DAY }, now: NOW },
      maps,
    );
    expect(a.prevTotalMin).toBe(0);
    expect(a.deltaPct).toBeNull();
  });
});

describe("analyzePerson — persona sin actividad", () => {
  it("devuelve ceros y ningún desglose, sin romperse", () => {
    const a = analyzePerson({ records: RECORDS, person: "Nadie", ...SEMANA, now: NOW }, maps);
    expect(a.totalMin).toBe(0);
    expect(a.activeDays).toBe(0);
    expect(a.focusPct).toBe(0);
    expect(a.billablePct).toBe(0);
    expect(a.byProject).toEqual([]);
    expect(a.topTasks).toEqual([]);
    expect(a.bestDay?.minutes).toBe(0);
  });
});

describe("periodFor", () => {
  const MIERCOLES = new Date(2026, 6, 22, 15, 0, 0).getTime(); // miércoles 22 jul 2026

  it("la semana en curso va de lunes a domingo", () => {
    const p = periodFor("week", 0, MIERCOLES);
    expect(new Date(p.from).getDate()).toBe(20); // lunes
    expect(p.to - p.from).toBe(7 * DAY);
    expect(p.label).toBe("Esta semana");
    expect(p.canGoNext).toBe(false); // no se puede avanzar al futuro
  });

  it("navega hacia atrás semana a semana, con el periodo anterior pegado", () => {
    const p = periodFor("week", -1, MIERCOLES);
    expect(new Date(p.from).getDate()).toBe(13);
    expect(p.label).toBe("Semana pasada");
    expect(p.prev?.to).toBe(p.from);
    expect(p.canGoNext).toBe(true);
  });

  it("etiqueta las semanas viejas con sus fechas", () => {
    expect(periodFor("week", -3, MIERCOLES).label).toBe("29 jun – 5 jul");
  });

  it("el mes es natural y compara contra el mes anterior", () => {
    const p = periodFor("month", 0, MIERCOLES);
    expect(new Date(p.from).getDate()).toBe(1);
    expect(new Date(p.from).getMonth()).toBe(6); // julio
    expect(new Date(p.to).getMonth()).toBe(7); // agosto
    expect(new Date(p.prev!.from).getMonth()).toBe(5); // junio
    expect(p.label).toBe("Este mes");
  });

  it("cruza el fin de año sin romperse", () => {
    const enero = new Date(2027, 0, 15).getTime();
    const p = periodFor("month", -1, enero);
    expect(new Date(p.from).getMonth()).toBe(11); // diciembre
    expect(new Date(p.from).getFullYear()).toBe(2026);
    expect(p.label).toBe("diciembre 2026");
  });

  it("'todo' abarca desde el principio y no ofrece comparativa", () => {
    const p = periodFor("all", 0, MIERCOLES);
    expect(p.from).toBe(0);
    expect(p.prev).toBeUndefined();
    expect(p.canGoNext).toBe(false);
  });
});
