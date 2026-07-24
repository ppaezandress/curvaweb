import { describe, it, expect } from "vitest";
import { buildDaySessions, analyzeDay, dailyTrend, type LocalEntry } from "@/lib/day-analytics";
import type { TimeRecord } from "@/lib/notion/fetchers";
import type { Task, Project, Client, TaskType } from "@/lib/mock-data";

// El motor del día es donde más caro sale un error: alimenta "Tu día", /dia y los KPIs que
// el equipo lee como verdad. Cada prueba de aquí corresponde a algo que ya se rompió en
// producción (horas fantasma en el futuro, "terminaste" a una hora falsa, doble conteo del
// mismo tramo, due date corrido por zona horaria).

const YO = "Andrés Páez";
const DAY_START = new Date(2026, 6, 15, 0, 0, 0, 0).getTime(); // miércoles 15 jul 2026, local
const at = (h: number, m = 0) => DAY_START + h * 3_600_000 + m * 60_000;
const NOW = at(18); // "ahora" son las 18:00 de ese día

const task = (over: Partial<Task> & { id: string }): Task => ({
  name: `Tarea ${over.id}`, responsableId: "andres", clientId: "c1", projectId: "p1",
  typeId: "t1", status: "En curso", baselineSeconds: 0, ...over,
});

const maps = {
  taskById: {
    a: task({ id: "a" }),
    b: task({ id: "b", projectId: "p2" }),
    interna: task({ id: "interna", internal: true, projectId: "" }),
  } as Record<string, Task>,
  projectById: {
    p1: { id: "p1", name: "Proyecto Uno", clientId: "c1" },
    p2: { id: "p2", name: "Proyecto Dos", clientId: "c1" },
  } as Record<string, Project>,
  clientById: {
    c1: { id: "c1", name: "Cliente Uno", phase: "", status: "Activo" },
  } as Record<string, Client>,
  taskTypeById: { t1: { id: "t1", label: "Consultoría", color: "var(--color-curva-blue)" } } as Record<string, TaskType>,
};

const rec = (over: Partial<TimeRecord> & { id: string; start: string; minutes: number }): TimeRecord => ({
  taskId: "a", person: YO, inactiveMinutes: 0, mode: "manual", ...over,
});

const entry = (over: Partial<LocalEntry> & { id: string; startedAt: number; seconds: number }): LocalEntry => ({
  taskId: "a", endedAt: over.startedAt + over.seconds * 1000, ...over,
});

describe("buildDaySessions", () => {
  it("ignora los registros de otras personas", () => {
    const s = buildDaySessions({
      records: [
        rec({ id: "1", start: new Date(at(9)).toISOString(), minutes: 60 }),
        rec({ id: "2", start: new Date(at(10)).toISOString(), minutes: 60, person: "Otra Persona" }),
      ],
      recentEntries: [], entries: [], myName: YO, dayStart: DAY_START, now: NOW,
    }, maps);
    expect(s.map((x) => x.id)).toEqual(["1"]);
  });

  it("descarta sesiones fechadas en el FUTURO (el bug de la hora falsa en 'terminaste')", () => {
    // El modal proponía, pasada la medianoche, una hora de ayer con la fecha de hoy y
    // acababa creando sesiones que aún no ocurrían.
    const s = buildDaySessions({
      records: [
        rec({ id: "ok", start: new Date(at(9)).toISOString(), minutes: 30 }),
        rec({ id: "futuro", start: new Date(at(23, 25)).toISOString(), minutes: 34 }),
      ],
      recentEntries: [], entries: [], myName: YO, dayStart: DAY_START, now: NOW,
    }, maps);
    expect(s.map((x) => x.id)).toEqual(["ok"]);
  });

  it("no cuenta dos veces un tramo local que ya está en Notion", () => {
    const s = buildDaySessions({
      records: [rec({ id: "notion-1", start: new Date(at(9)).toISOString(), minutes: 30 })],
      recentEntries: [],
      entries: [entry({ id: "local-1", startedAt: at(9), seconds: 1800, notionId: "notion-1" })],
      myName: YO, dayStart: DAY_START, now: NOW,
    }, maps);
    expect(s).toHaveLength(1);
    expect(s[0].id).toBe("notion-1");
  });

  it("excluye los tramos ya conciliados (synced) y conserva los pendientes", () => {
    const s = buildDaySessions({
      records: [], recentEntries: [],
      entries: [
        entry({ id: "sync", startedAt: at(9), seconds: 600, synced: true }),
        entry({ id: "vivo", startedAt: at(10), seconds: 600 }),
      ],
      myName: YO, dayStart: DAY_START, now: NOW,
    }, maps);
    expect(s.map((x) => x.id)).toEqual(["vivo"]);
  });

  it("deduplica recentEntries contra los registros ya indexados en Notion", () => {
    const s = buildDaySessions({
      records: [rec({ id: "dup", start: new Date(at(9)).toISOString(), minutes: 20 })],
      recentEntries: [rec({ id: "dup", start: new Date(at(9)).toISOString(), minutes: 20 })],
      entries: [], myName: YO, dayStart: DAY_START, now: NOW,
    }, maps);
    expect(s).toHaveLength(1);
  });

  it("usa el Fin REAL de Notion cuando existe, no inicio+minutos", () => {
    const [s] = buildDaySessions({
      records: [rec({
        id: "1", start: new Date(at(9)).toISOString(), end: new Date(at(11)).toISOString(), minutes: 45,
      })],
      recentEntries: [], entries: [], myName: YO, dayStart: DAY_START, now: NOW,
    }, maps);
    expect(s.end).toBe(at(11)); // 2h de reloj, 45 min medidos
    expect(s.minutes).toBe(45);
  });

  it("devuelve las sesiones ordenadas por hora de inicio", () => {
    const s = buildDaySessions({
      records: [
        rec({ id: "tarde", start: new Date(at(16)).toISOString(), minutes: 30 }),
        rec({ id: "temprano", start: new Date(at(8)).toISOString(), minutes: 30 }),
      ],
      recentEntries: [], entries: [], myName: YO, dayStart: DAY_START, now: NOW,
    }, maps);
    expect(s.map((x) => x.id)).toEqual(["temprano", "tarde"]);
  });

  it("una junta de GCal sin tarea muestra su título, no 'Sin proyecto' (feedback Balmori)", () => {
    const [s] = buildDaySessions({
      records: [rec({
        id: "junta", start: new Date(at(11)).toISOString(), minutes: 60,
        taskId: "", activity: "Junta", label: "Junta con Pepe y Dra Pilar",
      })],
      recentEntries: [], entries: [], myName: YO, dayStart: DAY_START, now: NOW,
    }, maps);
    // El nombre visible de la sesión ({s.task || s.project} en la UI) es el título de la junta.
    expect(s.task).toBe("Junta con Pepe y Dra Pilar");
    expect(s.project).toBe("Sin proyecto"); // el proyecto sigue vacío; el título vive en task
  });

  it("con tarea vinculada gana el nombre de la tarea, el label se ignora", () => {
    const [s] = buildDaySessions({
      records: [rec({
        id: "conTarea", start: new Date(at(11)).toISOString(), minutes: 60,
        taskId: "a", label: "algún título viejo del Nombre",
      })],
      recentEntries: [], entries: [], myName: YO, dayStart: DAY_START, now: NOW,
    }, maps);
    expect(s.task).toBe("Tarea a");
  });
});

describe("analyzeDay", () => {
  const base = {
    records: [
      rec({ id: "1", taskId: "a", start: new Date(at(9)).toISOString(), minutes: 60, inactiveMinutes: 6 }),
      rec({ id: "2", taskId: "b", start: new Date(at(11)).toISOString(), minutes: 30, activity: "Junta con cliente" }),
      rec({ id: "3", taskId: "interna", start: new Date(at(14)).toISOString(), minutes: 60 }),
    ],
    recentEntries: [], entries: [] as LocalEntry[], myName: YO, dayStart: DAY_START, now: NOW,
  };

  it("suma total, activo e inactivo", () => {
    const a = analyzeDay(base, maps);
    expect(a.total).toBe(150);
    expect(a.inactive).toBe(6);
    expect(a.active).toBe(144);
    expect(a.focusPct).toBe(96);
  });

  it("separa facturable de trabajo interno", () => {
    const a = analyzeDay(base, maps);
    expect(a.billableMin).toBe(90); // las dos con cliente; la interna no
    expect(a.billablePct).toBe(60);
  });

  it("clasifica juntas vs trabajo profundo por el tipo de actividad", () => {
    const a = analyzeDay(base, maps);
    expect(a.meetingMin).toBe(30);
    expect(a.deepMin).toBe(120);
  });

  it("cuenta los cambios de contexto entre proyectos consecutivos", () => {
    const a = analyzeDay(base, maps);
    expect(a.switches).toBe(2); // p1 → p2 → interno
  });

  it("cuenta como bloque profundo solo lo de 50 min o más", () => {
    const a = analyzeDay(base, maps);
    expect(a.deepBlocks).toBe(2); // las dos de 60; la de 30 no
  });

  it("nunca reporta que terminaste en el futuro", () => {
    const a = analyzeDay({
      ...base,
      records: [rec({ id: "1", start: new Date(at(17)).toISOString(), minutes: 180 })], // acabaría 20:00
      now: at(18),
    }, maps);
    expect(a.lastEnd).toBe(at(18)); // topado en "ahora", no 20:00
  });

  it("un día sin sesiones no inventa métricas", () => {
    const a = analyzeDay({ ...base, records: [] }, maps);
    expect(a.total).toBe(0);
    expect(a.focusPct).toBe(0);
    expect(a.densityPct).toBe(0);
    expect(a.firstStart).toBe(0);
    expect(a.lastEnd).toBe(0);
  });

  it("cuenta las tareas que vencen hoy con la fecha LOCAL de Notion", () => {
    const conDue = {
      ...maps,
      taskById: { ...maps.taskById, a: task({ id: "a", dueDate: "2026-07-15" }) },
    };
    const a = analyzeDay(base, conDue);
    expect(a.dueToday).toBe(1);
    expect(a.dueTouched).toBe(1); // sí trabajé en ella hoy
  });

  it("compara contra el promedio de días previos con actividad", () => {
    const a = analyzeDay({
      ...base,
      priorRecords: [
        rec({ id: "p1", start: new Date(DAY_START - 86_400_000 + 9 * 3_600_000).toISOString(), minutes: 100 }),
        rec({ id: "p2", start: new Date(DAY_START - 2 * 86_400_000 + 9 * 3_600_000).toISOString(), minutes: 200 }),
      ],
      priorDays: 30,
    }, maps);
    expect(a.avgDayMin).toBe(150);
    expect(a.deltaVsAvgPct).toBe(0); // hoy también 150
  });
});

describe("dailyTrend", () => {
  it("devuelve un punto por día, marca hoy y no cuenta el futuro", () => {
    const t = dailyTrend(
      [
        rec({ id: "1", start: new Date(at(9)).toISOString(), minutes: 60 }),
        rec({ id: "2", start: new Date(DAY_START - 86_400_000 + 9 * 3_600_000).toISOString(), minutes: 30 }),
        rec({ id: "3", start: new Date(DAY_START + 5 * 86_400_000).toISOString(), minutes: 999 }), // futuro
      ],
      YO, 3, DAY_START, NOW,
    );
    expect(t).toHaveLength(3);
    expect(t[2].isToday).toBe(true);
    expect(t[2].minutes).toBe(60);
    expect(t[1].minutes).toBe(30);
    expect(t.some((d) => d.minutes === 999)).toBe(false);
  });
});
