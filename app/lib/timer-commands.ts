// Comandos del cronómetro — la semántica compartida por TODOS los mandos: teclado
// (components/Hotkeys.tsx) y gestos de la mano (lib/use-gesture-control.ts). Vive aparte y sin
// React a propósito: así el atajo y el gesto no pueden desincronizarse, y la lógica se prueba
// sin montar nada (tests/unit/timer-commands.test.ts).
//
// Ojo con una trampa del núcleo: `switchTo` es literalmente `start`, y `start` sobre la tarea
// que YA está corriendo cierra el tramo y abre otro — parte el historial en dos registros sin
// que nadie lo pida. Con gestos eso pasaría cada vez que sostienes la mano, así que aquí un
// "cambia a la tarea en la que ya estás" se resuelve a NO HACER NADA.

export type TimerCommand =
  | { kind: "switch"; index: number } // ir a la n-ésima tarea del dock (0-based)
  | { kind: "pause" } // parar el reloj
  | { kind: "resume" } // seguir con lo último, sin tener que recordar qué número era
  | { kind: "toggle" }; // pausar si corre; si no, reanudar la primera del dock

export type CommandContext = {
  openTasks: string[];
  activeTaskId: string | null;
};

// Lo que de verdad hay que ejecutar, ya resuelto contra el estado. `null` = no aplica
// (índice fuera del dock, pausar sin nada corriendo, cambiar a la que ya corre).
export type ResolvedAction =
  | { kind: "switch"; taskId: string; index: number }
  | { kind: "pause"; taskId: string }
  | null;

export function resolveCommand(cmd: TimerCommand, ctx: CommandContext): ResolvedAction {
  const { openTasks, activeTaskId } = ctx;

  if (cmd.kind === "switch") {
    const taskId = openTasks[cmd.index];
    if (!taskId) return null; // no hay tantas tareas abiertas
    if (taskId === activeTaskId) return null; // ya estás ahí: no partir el tramo
    return { kind: "switch", taskId, index: cmd.index };
  }

  if (cmd.kind === "pause") {
    if (!activeTaskId) return null;
    return { kind: "pause", taskId: activeTaskId };
  }

  // Reanudar: el complemento de pausar. Mano abierta suelta el trabajo, mano cerrada lo
  // vuelve a agarrar — sin obligar a nadie a recordar en qué número del dock estaba.
  if (cmd.kind === "resume") {
    if (activeTaskId) return null; // ya está corriendo: no hay nada que reanudar
    const first = openTasks[0];
    return first ? { kind: "switch", taskId: first, index: 0 } : null;
  }

  // toggle (tecla Espacio): pausa lo que corre, o reanuda la primera del dock.
  if (activeTaskId) return { kind: "pause", taskId: activeTaskId };
  const first = openTasks[0];
  return first ? { kind: "switch", taskId: first, index: 0 } : null;
}

/** Texto para el toast de confirmación. `taskName` viene del catálogo de tareas. */
export function describeAction(action: NonNullable<ResolvedAction>, taskName?: string): string {
  const name = taskName?.trim() || "la tarea";
  return action.kind === "pause" ? `En pausa · ${name}` : `Midiendo · ${name}`;
}

// ── Mando: teclado ──
// 1-9 → cambiar de pestaña; Espacio → pausar/reanudar. Es el comportamiento que ya tenía
// Hotkeys, movido aquí para poder probarlo.
export function commandForKey(e: { code: string; key: string }): TimerCommand | null {
  if (e.code === "Space") return { kind: "toggle" };
  if (/^[1-9]$/.test(e.key)) return { kind: "switch", index: Number(e.key) - 1 };
  return null;
}
