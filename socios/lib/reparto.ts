// Motor de reparto de CURVA — lógica pura, sin dependencias.
// Portado y validado (108 combinaciones sin fuga + Monte Carlo). Fuente única de la matemática.

export const PESO = { P: 1.8, E: 1.5, A: 1.0 } as const;
export const PISO = { P: 8000, E: 6000, A: 4000 } as const;
export const ROLNAME = { P: "Piloto", E: "Especialista", A: "Apoyo" } as const;

export type Rol = "P" | "E" | "A";
export type Quien = "socioA" | "socioB" | "nucleo" | "nuevo";

export type Miembro = { rol: Rol; quien: Quien; nombre: string; sm: number };
export type Proyecto = {
  id: string;
  nombre: string;
  ticket: number;
  tipo: "trazo" | "trayectoria" | "alianza";
  cajaPct: number;
  comisOn: boolean;
  comisWho: "banca" | "equipo";
  inMonth: boolean;
  members: Miembro[];
  clienteId?: string | null;
  clienteNombre?: string | null;
};

export type Reglas = {
  alpha: number; pool: number; beta: number; split: number; ahorro: number; imp: number;
};

export const REGLAS_DEFAULT: Reglas = { alpha: 60, pool: 12, beta: 0, split: 60, ahorro: 15, imp: 30 };

export const isSocio = (q: Quien) => q === "socioA" || q === "socioB";

export function baseBolsa(t: number): number {
  const br: [number, number][] = [[40000, 0.4], [80000, 0.3], [150000, 0.2], [Infinity, 0.15]];
  let b = 0, prev = 0;
  for (const [cap, r] of br) { b += r * Math.max(0, Math.min(t, cap) - prev); prev = cap; if (t <= cap) break; }
  return b;
}

export type Persona = { nombre: string; quien: Quien; roles: string[]; trabajo: number; extra: number };

export type Resultado = {
  t: number; bolsaOut: number; marginBruto: number; comis: number; comisPaid: number; comisBanca: number;
  cajaProj: number; marginOp: number; cajaAhorro: number; poolAmt: number; utilKept: number; utilSwept: number;
  disc: number; socioA: number; socioB: number; sAseat: number; sBseat: number; sAutil: number; sButil: number;
  banca: number; people: Record<string, Persona>;
};

export function compute(pr: Proyecto, P: Reglas): Resultado {
  const t = Math.max(0, +pr.ticket || 0);
  const mem = pr.members.map((m) => ({ ...m }));
  let sumw = 0; mem.forEach((m) => { sumw += PESO[m.rol] * (isSocio(m.quien) ? 1 : (+m.sm || 1)); });
  const bb = baseBolsa(t), vpw = sumw > 0 ? bb / sumw : 0;
  let topup = 0, disc = 0, sAseat = 0, sBseat = 0;
  const pay: Record<number, number> = {};
  mem.forEach((m, i) => {
    const sm = isSocio(m.quien) ? 1 : (+m.sm || 1);
    const g = PESO[m.rol] * sm * vpw;
    if (isSocio(m.quien)) { pay[i] = (P.alpha / 100) * g; disc += (1 - P.alpha / 100) * g; if (m.quien === "socioA") sAseat += pay[i]; else sBseat += pay[i]; }
    else { pay[i] = Math.max(g, PISO[m.rol]); topup += Math.max(0, pay[i] - g); }
  });
  const bolsaOut = bb + topup, marginBruto = t - bolsaOut;
  const comis = pr.comisOn ? Math.min(marginBruto * 0.1, 30000) : 0;
  const comisBanca = pr.comisOn && pr.comisWho === "banca" ? comis : 0;
  const comisPaid = pr.comisOn && pr.comisWho === "equipo" ? comis : 0;
  const cajaProj = t * (pr.cajaPct / 100) - topup;
  const marginOp = marginBruto - comis - cajaProj;
  const cajaAhorro = marginOp * (P.ahorro / 100), utilidad = marginOp - cajaAhorro;
  const nucleo = mem.filter((m) => m.quien === "nucleo");
  const poolAmt = nucleo.length ? utilidad * (P.pool / 100) : 0;
  const poolEach = nucleo.length ? poolAmt / nucleo.length : 0;
  const utilRest = utilidad - poolAmt, utilKept = utilRest * (1 - P.beta / 100), utilSwept = utilRest * (P.beta / 100);
  const sAutil = utilKept * (P.split / 100), sButil = utilKept * (1 - P.split / 100);
  const banca = cajaAhorro + disc + utilSwept + comisBanca;
  const people: Record<string, Persona> = {};
  const nm = (m: Miembro) => (m.quien === "socioA" ? "Andrés" : m.quien === "socioB" ? "Balmo" : m.nombre);
  mem.forEach((m, i) => {
    const k = nm(m) + "|" + m.quien;
    if (!people[k]) people[k] = { nombre: nm(m), quien: m.quien, roles: [], trabajo: 0, extra: 0 };
    people[k].roles.push(ROLNAME[m.rol]); people[k].trabajo += pay[i];
  });
  (["socioA", "socioB"] as const).forEach((sq) => {
    const k = (sq === "socioA" ? "Andrés" : "Balmo") + "|" + sq;
    if (!people[k]) people[k] = { nombre: sq === "socioA" ? "Andrés" : "Balmo", quien: sq, roles: ["—"], trabajo: 0, extra: 0 };
  });
  Object.keys(people).forEach((k) => {
    const a = people[k];
    if (a.quien === "socioA") a.extra = sAutil; else if (a.quien === "socioB") a.extra = sButil; else if (a.quien === "nucleo") a.extra = poolEach;
  });
  return { t, bolsaOut, marginBruto, comis, comisPaid, comisBanca, cajaProj, marginOp, cajaAhorro, poolAmt, utilKept, utilSwept, disc, socioA: sAseat + sAutil, socioB: sBseat + sButil, sAseat, sBseat, sAutil, sButil, banca, people };
}

export const fmtMXN = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v || 0);
export const pctFmt = (x: number) => (x * 100).toFixed(0) + "%";
