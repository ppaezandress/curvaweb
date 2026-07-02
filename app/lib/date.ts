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

/**
 * Parsea una fecha de Notion como fecha LOCAL.
 * `new Date("2026-07-01")` la interpreta como UTC medianoche → en zonas UTC-negativas
 * (México UTC-6) se corre un día atrás. Para fechas date-only construimos con Y/M/D local.
 * Si trae hora (ISO con "T"), se respeta tal cual.
 */
export function parseDateOnly(iso?: string | null): Date | null {
  if (!iso) return null;
  if (iso.includes("T")) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** ms epoch (local) de una fecha date-only de Notion, o null. */
export function dueDateMs(iso?: string | null): number | null {
  const d = parseDateOnly(iso);
  return d ? d.getTime() : null;
}

/** "1 jul" — etiqueta corta de una fecha de Notion, sin correrse por zona horaria. */
export function dueDateLabel(iso?: string | null): string {
  const d = parseDateOnly(iso);
  if (!d) return "";
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}
