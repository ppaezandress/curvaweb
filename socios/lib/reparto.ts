// Motor de reparto de CURVA — lógica pura, sin dependencias.
// Portado y validado (108 combinaciones sin fuga + Monte Carlo). Fuente única de la matemática.
//
// TODO parámetro del modelo vive en `Reglas` (= la hoja "Parámetros" del Excel):
// pesos, pisos, comisión, apalancamiento por ticket, umbrales, seniority y nombres.
// Nada se queda hardcodeado — así los socios pueden "mover" cualquier cosa desde la app.

export type Rol = "P" | "E" | "A";
export type Quien = "socioA" | "socioB" | "nucleo" | "nuevo";

export const ROLNAME = { P: "Piloto", E: "Especialista", A: "Apoyo" } as const;

export type Miembro = { rol: Rol; quien: Quien; nombre: string; sm: number };
export type Proyecto = {
  id: string;
  nombre: string;
  ticket: number;
  tipo: "trazo" | "trayectoria" | "alianza";
  cajaPct: number;
  comisOn: boolean;
  comisWho: "banca" | "equipo";
  // Quién trajo el cliente (decide la comisión de origen, regla blindada):
  //  empresa/inbound → sin comisión · socio → comisión a la Banca · persona → a esa persona.
  origen?: "empresa" | "socio" | "persona";
  origenPersona?: string;   // nombre de quien la cobra cuando origen = "persona"
  inMonth: boolean;
  members: Miembro[];
  clienteId?: string | null;
  clienteNombre?: string | null;
};

// ── El tablero de control (paridad con la hoja "Parámetros" del Excel) ──
export type Reglas = {
  // Compensación (todos en %)
  alpha: number;   // descuento del sombrero de socio → a Banca
  pool: number;    // pool del Núcleo (% de la utilidad)
  beta: number;    // barrido de utilidad a Banca
  split: number;   // reparto Socio A (resto al Socio B)
  ahorro: number;  // caja de ahorro (% del margen operativo)
  imp: number;     // impuesto aprox sobre la utilidad
  // Comisión de origen
  comisPct: number;   // % del margen (10)
  comisTope: number;  // tope en $ (30000)
  // Pesos de rol (multiplicadores; lo que cuenta es la proporción)
  pesoP: number; pesoE: number; pesoA: number;         // 1.8 / 1.5 / 1.0
  // Apalancamiento: % de equipo según el tamaño del ticket (brackets marginales, en %)
  brkChico: number; brkMediano: number; brkGrande: number; brkTope: number; // 40/30/20/15
  umbral1: number; umbral2: number; umbral3: number;   // 40000 / 80000 / 150000
  // Seniority de un integrante nuevo (multiplicador de su parte)
  smNuevo: number;    // 0.7
  // Banca / Núcleo
  pisoNucleo: number; // piso mensual TOTAL del Núcleo (32000). Meta de Banca = 3×.
  // Nombres de los socios
  nombreA: string; nombreB: string;  // "Andrés" / "Balmo"
};

export const REGLAS_DEFAULT: Reglas = {
  // pool arranca en 0: el bono del Núcleo es un PENDIENTE (se prende cuando haya
  // equipo de planta y estén seguros de sostenerlo). Decisión 2026-07-09.
  alpha: 60, pool: 0, beta: 0, split: 60, ahorro: 15, imp: 30,
  comisPct: 10, comisTope: 30000,
  pesoP: 1.8, pesoE: 1.5, pesoA: 1.0,
  brkChico: 40, brkMediano: 30, brkGrande: 20, brkTope: 15,
  umbral1: 40000, umbral2: 80000, umbral3: 150000,
  smNuevo: 0.7,
  pisoNucleo: 32000,
  nombreA: "Andrés", nombreB: "Balmo",
};

// Meta de la Banca = colchón de 3 meses de pisos del Núcleo.
export const metaBanca = (R: Reglas) => (+R.pisoNucleo || 0) * 3;

export const isSocio = (q: Quien) => q === "socioA" || q === "socioB";

// Bolsa base del equipo por tramos marginales, según los brackets/umbrales de las Reglas.
export function baseBolsa(t: number, R: Reglas): number {
  const br: [number, number][] = [
    [R.umbral1, R.brkChico / 100],
    [R.umbral2, R.brkMediano / 100],
    [R.umbral3, R.brkGrande / 100],
    [Infinity, R.brkTope / 100],
  ];
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
  const PESO = { P: P.pesoP, E: P.pesoE, A: P.pesoA } as const;
  const t = Math.max(0, +pr.ticket || 0);
  const mem = pr.members.map((m) => ({ ...m }));
  let sumw = 0; mem.forEach((m) => { sumw += PESO[m.rol] * (isSocio(m.quien) ? 1 : (+m.sm || 1)); });
  const bb = baseBolsa(t, P), vpw = sumw > 0 ? bb / sumw : 0;
  let disc = 0, sAseat = 0, sBseat = 0;
  const pay: Record<number, number> = {};
  // Cada quien cobra lo que le toca del reparto de la bolsa. Sin tarifa mínima:
  // en un ticket chico simplemente sale menos, nunca se fuerza un pago que
  // meta a CURVA en números rojos.
  mem.forEach((m, i) => {
    const sm = isSocio(m.quien) ? 1 : (+m.sm || 1);
    const g = PESO[m.rol] * sm * vpw;
    if (isSocio(m.quien)) { pay[i] = (P.alpha / 100) * g; disc += (1 - P.alpha / 100) * g; if (m.quien === "socioA") sAseat += pay[i]; else sBseat += pay[i]; }
    else { pay[i] = g; }
  });
  const bolsaOut = bb, marginBruto = t - bolsaOut;
  // Comisión de origen — regla blindada: un socio-originador NUNCA la cobra a su
  // bolsillo (diluye al otro socio), va a la Banca. Solo Núcleo/externo la cobra.
  const comisOn = pr.origen ? pr.origen !== "empresa" : pr.comisOn;
  const comisWho = pr.origen === "persona" ? "equipo" : pr.origen === "socio" ? "banca" : pr.comisWho;
  const comis = comisOn ? Math.min(marginBruto * (P.comisPct / 100), P.comisTope) : 0;
  const comisBanca = comisOn && comisWho === "banca" ? comis : 0;
  const comisPaid = comisOn && comisWho === "equipo" ? comis : 0;
  const cajaProj = t * (pr.cajaPct / 100);
  const marginOp = marginBruto - comis - cajaProj;
  const cajaAhorro = marginOp * (P.ahorro / 100), utilidad = marginOp - cajaAhorro;
  const nucleo = mem.filter((m) => m.quien === "nucleo");
  const poolAmt = nucleo.length ? utilidad * (P.pool / 100) : 0;
  const poolEach = nucleo.length ? poolAmt / nucleo.length : 0;
  const utilRest = utilidad - poolAmt, utilKept = utilRest * (1 - P.beta / 100), utilSwept = utilRest * (P.beta / 100);
  const sAutil = utilKept * (P.split / 100), sButil = utilKept * (1 - P.split / 100);
  const banca = cajaAhorro + disc + utilSwept + comisBanca;
  const people: Record<string, Persona> = {};
  const nm = (m: Miembro) => (m.quien === "socioA" ? P.nombreA : m.quien === "socioB" ? P.nombreB : m.nombre);
  mem.forEach((m, i) => {
    const k = nm(m) + "|" + m.quien;
    if (!people[k]) people[k] = { nombre: nm(m), quien: m.quien, roles: [], trabajo: 0, extra: 0 };
    people[k].roles.push(ROLNAME[m.rol]); people[k].trabajo += pay[i];
  });
  (["socioA", "socioB"] as const).forEach((sq) => {
    const k = (sq === "socioA" ? P.nombreA : P.nombreB) + "|" + sq;
    if (!people[k]) people[k] = { nombre: sq === "socioA" ? P.nombreA : P.nombreB, quien: sq, roles: ["—"], trabajo: 0, extra: 0 };
  });
  Object.keys(people).forEach((k) => {
    const a = people[k];
    if (a.quien === "socioA") a.extra = sAutil; else if (a.quien === "socioB") a.extra = sButil; else if (a.quien === "nucleo") a.extra = poolEach;
  });
  // La comisión que cobra un Núcleo/externo (comisPaid) se suma a quien la trajo,
  // para que aparezca en "cuánto cobra cada quien".
  if (comisPaid > 0.5) {
    const quien = (pr.origenPersona || "Quien lo trajo").trim();
    const k = quien + "|comis";
    if (!people[k]) people[k] = { nombre: quien, quien: "nuevo", roles: ["comisión"], trabajo: 0, extra: 0 };
    people[k].extra += comisPaid;
  }
  return { t, bolsaOut, marginBruto, comis, comisPaid, comisBanca, cajaProj, marginOp, cajaAhorro, poolAmt, utilKept, utilSwept, disc, socioA: sAseat + sAutil, socioB: sBseat + sButil, sAseat, sBseat, sAutil, sButil, banca, people };
}

export const fmtMXN = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v || 0);
export const pctFmt = (x: number) => (x * 100).toFixed(0) + "%";
