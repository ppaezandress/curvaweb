// Helpers de fecha — fuente única (antes mondayOf/monthLabel estaban duplicados).

/** Lunes (00:00) de la semana que contiene a `d`. Semana L→D. */
export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // 0 = lunes
  x.setDate(x.getDate() - day);
  return x;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "junio 2026" */
export function monthLabel(d: Date): string {
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** "jun" (etiqueta corta para gráficas). */
export function monthShort(d: Date): string {
  return MESES_CORTOS[d.getMonth()];
}

/** Primer día (00:00) del mes que contiene a `d`. */
export function firstDayOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(1);
  return x;
}

export const DIAS_CORTOS = ["L", "M", "M", "J", "V", "S", "D"];
