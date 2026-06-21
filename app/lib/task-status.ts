// Estado de tareas — tolerante a los nombres reales del Status en Notion.
// Fuente única de verdad (antes estaba duplicado en dashboard, TaskCard y recap).

/** ¿La tarea está terminada? */
export const isDone = (status: string): boolean =>
  /done|complet|listo|termin|finaliz/i.test(status || "");

/** ¿La tarea es accionable hoy? (en curso, demorada, por validar, en espera…) */
export const isActionable = (status: string): boolean => {
  const s = status || "";
  if (isDone(s)) return false;
  return /curso|progress|haciendo|demor|atras|blocked|validar|revis|espera|hold|empez|sin\s/i.test(s) || s.trim() === "";
};
