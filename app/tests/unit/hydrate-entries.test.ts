import { describe, it, expect } from "vitest";
import { hydrateEntries } from "@/lib/app-context";
import type { TimeEntry } from "@/lib/app-context";

// Reproduce el bug de Balmori: "el día acumula bien, pero el contador de la tarea se reinicia".
//
// El total de una tarea = baseline de Notion + tramos locales !synced + sesión viva. Al
// recargar, el código marcaba TODOS los tramos synced a ciegas; los de HOY que aún no estaban
// en el rollup de Notion (lag de indexado) se perdían del total de la tarea, aunque el día
// seguía bien (se calcula de los registros crudos). hydrateEntries lo arregla conservando el
// estado real de sync de los tramos de hoy.

const NOW = new Date(2026, 6, 23, 15, 0, 0).getTime();
const at = (h: number) => new Date(2026, 6, 23, h, 0, 0).getTime(); // hoy
const ayer = (h: number) => new Date(2026, 6, 22, h, 0, 0).getTime();

const entry = (over: Partial<TimeEntry> & { endedAt: number }): TimeEntry => ({
  id: `e${over.endedAt}`, taskId: "a", userId: "u", startedAt: over.endedAt - 600_000,
  seconds: 600, inactiveSeconds: 0, mode: "manual", ...over,
});

describe("hydrateEntries", () => {
  it("un tramo de HOY posteado pero NO sincronizado sigue contando (el bug)", () => {
    // Se posteó a Notion pero el rollup aún no lo absorbió: debe seguir !synced para que cuente
    // en la tarea hasta que reconcileEntries lo sincronice contra el baseline real.
    const [e] = hydrateEntries([entry({ endedAt: at(14), posted: true, synced: false })], NOW);
    expect(e.synced).toBe(false);
  });

  it("un tramo de HOY ya sincronizado se queda synced (no se dobla)", () => {
    const [e] = hydrateEntries([entry({ endedAt: at(10), posted: true, synced: true })], NOW);
    expect(e.synced).toBe(true);
  });

  it("un tramo aún no posteado (offline) sigue contando", () => {
    const [e] = hydrateEntries([entry({ endedAt: at(14) })], NOW);
    expect(e.synced).toBe(false);
  });

  it("los tramos de días PREVIOS se marcan synced (el rollup ya los tiene, evita doble conteo)", () => {
    const [e] = hydrateEntries([entry({ endedAt: ayer(16), posted: true, synced: false })], NOW);
    expect(e.synced).toBe(true);
  });

  it("conserva el resto de campos y rellena los opcionales", () => {
    const [e] = hydrateEntries([{ id: "x", taskId: "a", userId: "u", startedAt: at(13), endedAt: at(14), seconds: 600 } as TimeEntry], NOW);
    expect(e.inactiveSeconds).toBe(0);
    expect(e.mode).toBe("manual");
    expect(e.seconds).toBe(600);
  });

  it("sin tramos, no revienta", () => {
    expect(hydrateEntries([], NOW)).toEqual([]);
    expect(hydrateEntries(undefined as unknown as TimeEntry[], NOW)).toEqual([]);
  });
});
