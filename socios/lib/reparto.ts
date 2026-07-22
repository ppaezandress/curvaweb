// Motor de reparto de CURVA — lógica pura, sin dependencias.
// Portado y validado (108 combinaciones sin fuga + Monte Carlo). Fuente única de la matemática.
//
// TODO parámetro del modelo vive en `Reglas` (= la hoja "Parámetros" del Excel):
// pesos, pisos, comisión, apalancamiento por ticket, umbrales, seniority y nombres.
// Nada se queda hardcodeado — así los socios pueden "mover" cualquier cosa desde la app.

export type Rol = "P" | "E" | "A";
export type Quien = "socioA" | "socioB" | "nucleo" | "nuevo";

export const ROLNAME = { P: "Piloto", E: "Especialista", A: "Apoyo" } as const;

// montoManual: sueldo TOTAL del proyecto fijado A MANO para este miembro (solo equipo,
// no socios). Si está, reemplaza lo calculado; la diferencia sale de la utilidad de los
// socios (Banca intacta). Se reparte parejo entre los meses que la persona trabaja.
export type Miembro = { rol: Rol; quien: Quien; nombre: string; sm: number; personId?: string; montoManual?: number };

// Cómo se cobra el proyecto y en cuánto tiempo (control de pagos del día a día).
export type ModoCobro = "golpe" | "mensual";
export type EstadoProyecto = "cotizacion" | "activo" | "cerrado" | "cancelado";

// Un pago que ENTRÓ del cliente. El % recibido NO se guarda: se deriva de Σmonto/ticket,
// así si editas el ticket los porcentajes se recalculan solos sin migración.
export type Pago = {
  id: string;
  fecha: string;             // ISO "YYYY-MM-DD"
  monto: number;             // MXN recibidos en ESTE pago (base modelo, SIN IVA)
  ivaCobrado?: number;       // informativo si conIVA (monto*0.16), no entra al modelo
  nota?: string;             // "Anticipo 60%", "2do pago"...
  facturaRef?: string | null;// liga al CFDI/comprobante
  desembolsado?: boolean;    // ya ejecutaste las transferencias en Revolut
};

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
  // ── Control de pagos (todo opcional → compute() los ignora y el estado viejo carga intacto) ──
  plazoMeses?: number;       // duración del proyecto
  // Composición del equipo POR MES (1-indexado). Deja variar quién trabaja y con
  // qué rol cada mes ("este mes piloteo yo, el que viene Lomba"). Opcional y
  // retrocompatible: sin agenda, `members` participa todos los meses por igual.
  // NO cambia la bolsa total (esa sale del ticket completo, Método A): solo cambia
  // cómo se distribuye entre (mes × persona). Ver repartoPorMes().
  agenda?: Record<number, Miembro[]>;
  modoCobro?: ModoCobro;     // "golpe" | "mensual"
  conIVA?: boolean;          // el ticket SIEMPRE es sin IVA; si true, al cliente se le suma 16% encima
  // Cómo tecleas el precio (una sola pregunta de IVA en la UI). El ticket guardado
  // SIEMPRE es la base sin IVA; ivaModo solo cambia cómo se muestra/captura y si
  // el cliente paga IVA. "sin"=sin IVA · "mas"=tecleas base, cliente paga +16% ·
  // "incluido"=tecleas el total con IVA, la app saca la base. conIVA = ivaModo!="sin".
  ivaModo?: "sin" | "mas" | "incluido";
  // ISR opcional POR PROYECTO (toggle en la Calculadora, junto al IVA). Si true, el
  // "neto" de este proyecto descuenta la tasa `imp` de las Reglas VIVAS (1.5% edit.).
  // Default false → sin ISR ("si no lo picas, no se descuenta"). No mueve el reparto.
  descontarISR?: boolean;
  estado?: EstadoProyecto;   // default "cotizacion"
  fechaInicio?: string;      // ISO, para proyecciones por mes en el Panel
  pagos?: Pago[];            // historial de cobros
  // Salidas de la Masa salarial: a qué integrante del equipo YA le transferiste su
  // parte de ESTE proyecto (nombre → fecha ISO). Solo se marca cuando el proyecto ya
  // está 100% liquidado. Los socios no viven aquí: su dinero es suyo, no se "adeuda".
  equipoPagado?: Record<string, string>;
  borrador?: boolean;        // scratch local de la Calculadora (no cuenta en Panel/Proyectos ni se sincroniza) hasta "Guardar"
  // Foto de las Reglas (parámetros de dinero) con las que se guardó el proyecto. Una
  // vez guardado, el proyecto se calcula SIEMPRE con esta foto — así mover perillas en
  // Reglas para un cálculo nuevo ya no recalcula proyectos viejos (sus cajas quedan
  // congeladas, como debe ser). Los NOMBRES no se congelan: se toman de las Reglas
  // vivas al calcular, para que renombrar un socio siga reflejándose en todos.
  // Ausente en borradores y en proyectos viejos pre-congelado (usan las Reglas vivas).
  reglas?: Reglas;
  // Autorización de cambios MANUALES de sueldo (montoManual en algún miembro). Cuando
  // se guarda un proyecto tocado a mano queda pendiente hasta que Balmo lo autorice.
  manualOK?: boolean;
};

// Datos bancarios para cobro (ficha que se le manda al cliente). Es info de
// RECEPCIÓN de pagos (se comparte por diseño), no un secreto; editable en la app.
export type DatosBancarios = {
  banco: string; producto: string; titular: string; cuenta: string; clabe: string; swift: string;
};

// ── El tablero de control (paridad con la hoja "Parámetros" del Excel) ──
export type Reglas = {
  // Compensación (todos en %)
  alpha: number;   // descuento del sombrero de socio → a Banca
  pool: number;    // pool del Núcleo (% de la utilidad)
  beta: number;    // barrido de utilidad a Banca
  split: number;   // reparto Socio A (resto al Socio B)
  ahorro: number;  // caja de ahorro (% del margen operativo)
  imp: number;     // ISR que reservas (% del ingreso). RESICO PF ~1–2.5%. Solo para ver el neto; no mueve el reparto.
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
  // Banca — meta del colchón (monto directo; el piso mensual del Núcleo se eliminó)
  metaBancaMonto: number; // 48000
  // Meta de FACTURACIÓN mensual (el sueño de ventas del mes). Se compara contra lo COBRADO.
  metaFacturacion: number; // 200000
  // Caja del proyecto — % por defecto según el tipo de proyecto. El modelo usa
  // pr.cajaPct (por proyecto, editable en la Calculadora); esto es solo el DEFAULT que
  // se aplica al elegir el tipo. Editable en Reglas para que los socios lo muevan.
  cajaTrazo: number; cajaTrayectoria: number; cajaAlianza: number; // 10 / 8 / 15
  // Nombres de los socios
  nombreA: string; nombreB: string;  // "Andrés" / "Balmo"
};

export const REGLAS_DEFAULT: Reglas = {
  // pool arranca en 0: el bono del Núcleo es un PENDIENTE (se prende cuando haya
  // equipo de planta y estén seguros de sostenerlo). Decisión 2026-07-09.
  // imp = tasa de ISR que se descuenta cuando el proyecto tiene "Descontar ISR"
  // activo. Default 1.5% (RESICO Persona Física, tramo típico). Editable en Reglas;
  // confírmalo con la contadora. Decisión 2026-07-18 (ISR opcional por proyecto).
  alpha: 60, pool: 10, beta: 0, split: 60, ahorro: 15, imp: 1.5,
  comisPct: 10, comisTope: 30000,
  pesoP: 1.8, pesoE: 1.5, pesoA: 1.0,
  brkChico: 40, brkMediano: 30, brkGrande: 20, brkTope: 15,
  umbral1: 40000, umbral2: 80000, umbral3: 150000,
  smNuevo: 0.7,
  metaBancaMonto: 48000,
  metaFacturacion: 200000,
  cajaTrazo: 10, cajaTrayectoria: 8, cajaAlianza: 15,
  nombreA: "Andrés", nombreB: "Balmo",
};

// Meta de la Banca — el colchón objetivo de CURVA (monto directo).
export const metaBanca = (R: Reglas) => (+R.metaBancaMonto || 0);

export const isSocio = (q: Quien) => q === "socioA" || q === "socioB";

// Campos de DINERO de las Reglas (todo menos los nombres de los socios). Sirve para
// detectar si un proyecto guardado se calcularía distinto con las Reglas VIVAS que con
// su foto congelada — la Calculadora avisa cuando difieren para que quede claro que en
// el Panel/Proyectos el proyecto conserva sus reglas de cuando se guardó.
export const REGLAS_MONEY_KEYS: (keyof Reglas)[] = [
  "alpha", "pool", "beta", "split", "ahorro", "imp", "comisPct", "comisTope",
  "pesoP", "pesoE", "pesoA", "brkChico", "brkMediano", "brkGrande", "brkTope",
  "umbral1", "umbral2", "umbral3", "smNuevo", "metaBancaMonto",
  "cajaTrazo", "cajaTrayectoria", "cajaAlianza",
];
export const reglasDifierenDinero = (a: Reglas, b: Reglas): boolean =>
  REGLAS_MONEY_KEYS.some((k) => (+a[k] || 0) !== (+b[k] || 0));

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

// Desglose de baseBolsa por tramos, para explicar VISUALMENTE en la UI qué tramo aplica
// a un ticket dado y cuánto aporta cada uno. Σ(aporte) === baseBolsa(t, R). `activo` =
// el ticket entra a este tramo; `lleno` = el ticket ya lo cubrió completo. Mover el %
// de un tramo con activo=false NO cambia la bolsa (de ahí la confusión de Balmo).
export type TramoBolsa = { i: number; desde: number; hasta: number; pct: number; aporte: number; activo: boolean; lleno: boolean };
export function baseBolsaDesglose(t: number, R: Reglas): TramoBolsa[] {
  const tramos: [number, number, number][] = [
    [0, R.umbral1, R.brkChico],
    [R.umbral1, R.umbral2, R.brkMediano],
    [R.umbral2, R.umbral3, R.brkGrande],
    [R.umbral3, Infinity, R.brkTope],
  ];
  return tramos.map(([desde, hasta, pct], i) => {
    const base = Math.max(0, Math.min(t, hasta) - desde);
    return { i, desde, hasta, pct, aporte: base * (pct / 100), activo: t > desde, lleno: t >= hasta };
  });
}

export type Persona = { nombre: string; quien: Quien; roles: string[]; trabajo: number; extra: number; comision: number };

export type Resultado = {
  t: number; bolsaOut: number; marginBruto: number; comis: number; comisPaid: number; comisBanca: number;
  cajaProj: number; marginOp: number; cajaAhorro: number; poolAmt: number; utilKept: number; utilSwept: number;
  disc: number; socioA: number; socioB: number; sAseat: number; sBseat: number; sAutil: number; sButil: number;
  banca: number; people: Record<string, Persona>;
  manualDelta: number; // extra pagado a mano al equipo, tomado de la utilidad de socios (0 si no hay override)
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
    if (isSocio(m.quien)) { pay[i] = (P.alpha / 100) * g; disc += (1 - P.alpha / 100) * g; }
    else { pay[i] = g; }
  });
  // Overrides manuales (equipo Y socios): fijas el pago de trabajo de alguien; la
  // diferencia (manualDelta) sale de la utilidad de los socios más abajo. Para un socio,
  // montoManual fija su "sombrero" (pago por trabajar el proyecto); el barrido a Banca
  // (disc) queda igual.
  let manualDelta = 0;
  mem.forEach((m, i) => {
    if (typeof m.montoManual === "number" && m.montoManual >= 0) {
      manualDelta += m.montoManual - pay[i];
      pay[i] = m.montoManual;
    }
  });
  // Sombrero de socio = su pago final por trabajar (base o fijado a mano).
  mem.forEach((m, i) => { if (m.quien === "socioA") sAseat += pay[i]; else if (m.quien === "socioB") sBseat += pay[i]; });
  const bolsaOut = bb, marginBruto = t - bolsaOut;
  // Comisión de origen — regla blindada: un socio-originador NUNCA la cobra a su
  // bolsillo (diluye al otro socio), va a la Banca. Solo Núcleo/externo la cobra.
  const comisOn = pr.origen ? pr.origen !== "empresa" : pr.comisOn;
  // Blindaje: si "quien lo trajo" resulta ser un socio, la comisión NUNCA va a su
  // bolsillo (vaciaría la Banca compartida) — se redirige a la Banca. Verificado
  // con docs_stress_test_origen.py (la fuga era hasta $30k/proyecto).
  const trajoSocio = pr.origen === "persona" && (pr.origenPersona === P.nombreA || pr.origenPersona === P.nombreB);
  const comisWho = pr.origen === "persona" ? (trajoSocio ? "banca" : "equipo") : pr.origen === "socio" ? "banca" : pr.comisWho;
  const comis = comisOn ? Math.min(marginBruto * (P.comisPct / 100), P.comisTope) : 0;
  const comisBanca = comisOn && comisWho === "banca" ? comis : 0;
  const comisPaid = comisOn && comisWho === "equipo" ? comis : 0;
  const cajaProj = t * (pr.cajaPct / 100);
  const marginOp = marginBruto - comis - cajaProj;
  const cajaAhorro = marginOp * (P.ahorro / 100), utilidad = marginOp - cajaAhorro;
  const nucleo = mem.filter((m) => m.quien === "nucleo");
  const poolAmt = nucleo.length ? utilidad * (P.pool / 100) : 0;
  const poolEach = nucleo.length ? poolAmt / nucleo.length : 0;
  const utilRest = utilidad - poolAmt, utilSwept = utilRest * (P.beta / 100);
  // El extra manual pagado al equipo (manualDelta) se descuenta de lo que se quedan los
  // socios (Banca intacta). Puede quedar negativo: "estás pagando más de lo que deja el proyecto".
  const utilKept = utilRest * (1 - P.beta / 100) - manualDelta;
  const sAutil = utilKept * (P.split / 100), sButil = utilKept * (1 - P.split / 100);
  const banca = cajaAhorro + disc + utilSwept + comisBanca;
  const people: Record<string, Persona> = {};
  const nm = (m: Miembro) => (m.quien === "socioA" ? P.nombreA : m.quien === "socioB" ? P.nombreB : m.nombre);
  mem.forEach((m, i) => {
    const k = nm(m) + "|" + m.quien;
    if (!people[k]) people[k] = { nombre: nm(m), quien: m.quien, roles: [], trabajo: 0, extra: 0, comision: 0 };
    people[k].roles.push(ROLNAME[m.rol]); people[k].trabajo += pay[i];
  });
  (["socioA", "socioB"] as const).forEach((sq) => {
    const k = (sq === "socioA" ? P.nombreA : P.nombreB) + "|" + sq;
    if (!people[k]) people[k] = { nombre: sq === "socioA" ? P.nombreA : P.nombreB, quien: sq, roles: ["—"], trabajo: 0, extra: 0, comision: 0 };
  });
  Object.keys(people).forEach((k) => {
    const a = people[k];
    if (a.quien === "socioA") a.extra = sAutil; else if (a.quien === "socioB") a.extra = sButil; else if (a.quien === "nucleo") a.extra = poolEach;
  });
  // La comisión (comisPaid) se suma a quien la trajo EN SU MISMA FILA (campo aparte
  // `comision`, para pintarla como una franjita naranja). Si el que la trae no es
  // miembro del proyecto (externo), se crea una fila solo-comisión.
  if (comisPaid > 0.5) {
    const quien = (pr.origenPersona || "Quien lo trajo").trim();
    const existing = Object.keys(people).find((k) => people[k].nombre === quien);
    if (existing) people[existing].comision += comisPaid;
    else people[quien + "|comis"] = { nombre: quien, quien: "nuevo", roles: ["comisión"], trabajo: 0, extra: 0, comision: comisPaid };
  }
  return { t, bolsaOut, marginBruto, comis, comisPaid, comisBanca, cajaProj, marginOp, cajaAhorro, poolAmt, utilKept, utilSwept, disc, socioA: sAseat + sAutil, socioB: sBseat + sButil, sAseat, sBseat, sAutil, sButil, banca, people, manualDelta };
}

// ── Reparto POR MES (Método A: bolsa anclada al total, distribuida en el tiempo) ──
// Toma el reparto del proyecto COMPLETO (compute) y lo reparte a lo largo de sus
// meses. La bolsa del equipo sale de baseBolsa(ticket_total) —invariante a cómo se
// corten los pagos— y se distribuye entre los "slots" (mes × persona) según la
// agenda (quién trabaja cada mes y con qué rol). Cambiar quién pilotea un mes solo
// mueve ESE mes; el total del equipo NO cambia. La utilidad de socios, el pool, las
// cajas y la comisión se prorratean uniformemente por mes.
//
// Propiedad clave (test): SIN agenda, repartoPorMes reproduce compute() exacto
// (Σ de los meses == total de cada persona). Con agenda, el total del equipo (bolsa)
// se conserva pero se redistribuye entre personas/meses.
export type PersonaMes = {
  nombre: string; quien: Quien; roles: string[];
  trabajo: number; extra: number; comision: number; neto: number;
};
export type ReparteMes = {
  mes: number;
  personas: Record<string, PersonaMes>;
  cajaProyecto: number; cajaAhorro: number; banca: number;
};

// Neto tras reservar ISR (Reglas.imp = % de ISR, editable; RESICO por confirmar).
// aplicaISR gobierna si se descuenta (viene del toggle por proyecto). Sin él, neto = bruto.
export const netoDe = (bruto: number, R: Reglas, aplicaISR = true) => (bruto || 0) * (1 - (aplicaISR ? (+R.imp || 0) : 0) / 100);

// Miembros activos en el mes m (1-indexado). Sin agenda → los mismos todos los meses.
export const miembrosDelMes = (pr: Proyecto, m: number): Miembro[] =>
  (pr.agenda && pr.agenda[m] && pr.agenda[m].length) ? pr.agenda[m] : pr.members;

export function repartoPorMes(pr: Proyecto, P: Reglas): ReparteMes[] {
  const PESO = { P: P.pesoP, E: P.pesoE, A: P.pesoA } as const;
  const N = Math.max(1, Math.floor(+(pr.plazoMeses || 0) || 1));
  const res = compute(pr, P);
  const nm = (m: Miembro) => (m.quien === "socioA" ? P.nombreA : m.quien === "socioB" ? P.nombreB : m.nombre);

  // 1) Peso total de todos los slots (mes × persona) según la agenda.
  const perMonth: { m: number; slots: { mem: Miembro; w: number }[] }[] = [];
  let totalW = 0;
  for (let m = 1; m <= N; m++) {
    const slots = miembrosDelMes(pr, m).map((x) => ({
      mem: x, w: PESO[x.rol] * (isSocio(x.quien) ? 1 : (+x.sm || 1)),
    }));
    slots.forEach((s) => (totalW += s.w));
    perMonth.push({ m, slots });
  }
  const vpw = totalW > 0 ? res.bolsaOut / totalW : 0;

  // 2) Prorrateo uniforme por mes de lo que no es "bolsa de trabajo".
  const per = 1 / N;
  const sAutilM = res.sAutil * per, sButilM = res.sButil * per;
  const cajaProjM = res.cajaProj * per, cajaAhorroM = res.cajaAhorro * per, bancaM = res.banca * per;
  const nucleoTotal = Object.values(res.people).filter((p) => p.quien === "nucleo").length;
  const poolPerNucleoM = nucleoTotal ? (res.poolAmt / nucleoTotal) * per : 0;
  const comisM = res.comisPaid > 0.5 ? res.comisPaid * per : 0;
  const comisQuien = (pr.origenPersona || "Quien lo trajo").trim();

  // Overrides manuales: cuántos meses trabaja cada persona (para repartir su sueldo fijo
  // parejo) y el monto manual por persona. Los socios ya salen reducidos vía res.sAutil.
  const mesesPresente: Record<string, number> = {};
  const manualDe: Record<string, number> = {};
  for (const { slots } of perMonth) {
    for (const s of slots) {
      const key = nm(s.mem) + "|" + s.mem.quien;
      mesesPresente[key] = (mesesPresente[key] || 0) + 1;
      if (typeof s.mem.montoManual === "number" && s.mem.montoManual >= 0) manualDe[key] = s.mem.montoManual;
    }
  }

  const out: ReparteMes[] = [];
  for (const { m, slots } of perMonth) {
    const personas: Record<string, PersonaMes> = {};
    const ensure = (nombre: string, quien: Quien): PersonaMes => {
      const k = nombre + "|" + quien;
      if (!personas[k]) personas[k] = { nombre, quien, roles: [], trabajo: 0, extra: 0, comision: 0, neto: 0 };
      return personas[k];
    };
    // trabajo (bolsa) por slot del mes; el socio cobra alpha%, el resto va a la Banca.
    // Si la persona tiene sueldo manual, se le pone su monto fijo parejo entre sus meses.
    for (const s of slots) {
      const key = nm(s.mem) + "|" + s.mem.quien, p = ensure(nm(s.mem), s.mem.quien);
      p.roles.push(ROLNAME[s.mem.rol]);
      if (key in manualDe) {
        p.trabajo += manualDe[key] / (mesesPresente[key] || 1);
      } else {
        const g = s.w * vpw;
        p.trabajo += isSocio(s.mem.quien) ? (P.alpha / 100) * g : g;
      }
    }
    // extra: utilidad de socios (siempre) + pool del Núcleo activo ese mes.
    ensure(P.nombreA, "socioA").extra += sAutilM;
    ensure(P.nombreB, "socioB").extra += sButilM;
    Object.values(personas).forEach((p) => { if (p.quien === "nucleo") p.extra += poolPerNucleoM; });
    // comisión: uniforme a quien la trajo. Si ya está en el equipo ese mes, se suma
    // a SU fila (igual que compute); si es externo/no está, se crea fila solo-comisión.
    if (comisM > 0) {
      const hit = Object.values(personas).find((p) => p.nombre === comisQuien);
      if (hit) hit.comision += comisM;
      else ensure(comisQuien, "nuevo").comision += comisM;
    }
    Object.values(personas).forEach((p) => { p.neto = netoDe(p.trabajo + p.extra + p.comision, P, !!pr.descontarISR); });
    out.push({ mes: m, personas, cajaProyecto: cajaProjM, cajaAhorro: cajaAhorroM, banca: bancaM });
  }
  return out;
}

// Total que paga el cliente. El ticket del modelo es SIN IVA; si el proyecto es
// "con IVA", al cliente se le suma 16% encima. El IVA nunca entra a la matemática.
export const IVA = 0.16;
export const totalCliente = (pr: Proyecto) =>
  (Math.max(0, +pr.ticket || 0)) * (pr.conIVA ? 1 + IVA : 1);

// Despeja el ticket base (SIN IVA) a partir de un monto que YA incluye IVA.
// Ej: $300,000 con IVA → $258,620.69 base. Úsalo cuando el usuario teclea el total
// que ve/factura y quiere que la calculadora le quite el IVA.
export const ticketSinIVA = (montoConIVA: number) => (Math.max(0, +montoConIVA || 0)) / (1 + IVA);

// % recibido = Σ de los pagos / ticket (0..1). Se DERIVA, no se guarda.
export const pctRecibido = (pr: Proyecto) => {
  const t = Math.max(0, +pr.ticket || 0);
  if (t <= 0) return 0;
  const sum = (pr.pagos || []).reduce((a, p) => a + (+p.monto || 0), 0);
  return Math.min(1, sum / t);
};

// ── Desembolso: cuánto transferir a cada caja cuando entra un pago ──
// Reparto SIMPLE proporcional (un solo reloj = % recibido). Decisión del usuario
// 2026-07-09: cada peso que devuelve compute() se escala por la fracción recibida.
export type DestinoKind =
  | "equipo" | "cajaProyecto" | "cajaAhorro" | "banca"
  | "socioA" | "socioB" | "nucleoBono" | "comision";

export type Movimiento = {
  destino: DestinoKind;
  etiqueta: string;   // "Masa salarial · Ivana", "Caja del proyecto", "Andrés"...
  quien?: Quien;      // para color de actor en la UI
  monto: number;      // a transferir AHORA (delta de este pago)
};

export type Desembolso = {
  montoRecibido: number;       // cash que entró en este evento (base modelo, sin IVA)
  movimientos: Movimiento[];   // transferencias a ejecutar (sin montos < 0.5)
  cuadra: boolean;             // Σmovimientos == montoRecibido
};

// Etiqueta legible de la caja de Revolut por destino.
export const CAJA_LABEL: Record<DestinoKind, string> = {
  equipo: "Masa salarial (equipo)",
  cajaProyecto: "Caja del proyecto",
  cajaAhorro: "Caja de ahorro",
  banca: "La Banca",
  socioA: "Socio A",
  socioB: "Socio B",
  nucleoBono: "Bono del Núcleo",
  comision: "Comisión",
};

// Reparte la fracción recibida (pctAcum − pctPrev) entre todas las cajas.
export function desembolso(pr: Proyecto, R: Reglas, ev: { pctPrev: number; pctAcum: number }): Desembolso {
  const r = compute(pr, R);
  const d = Math.max(0, (ev.pctAcum || 0) - (ev.pctPrev || 0));
  const mv: Movimiento[] = [];
  const push = (destino: DestinoKind, etiqueta: string, monto: number, quien?: Quien) => {
    if (monto > 0.5) mv.push({ destino, etiqueta, monto, quien });
  };
  // Cada persona: su trabajo + extra escalado a su caja; la comisión (franjita
  // naranja) va SIEMPRE a la caja "comisión", nunca al bolsillo de un socio.
  Object.values(r.people).forEach((p) => {
    const monto = (p.trabajo + p.extra) * d;
    if (p.quien === "socioA") push("socioA", p.nombre, monto, "socioA");
    else if (p.quien === "socioB") push("socioB", p.nombre, monto, "socioB");
    else if (p.trabajo + p.extra > 0.5) push("equipo", `Equipo · ${p.nombre}`, monto, p.quien);
    push("comision", `Comisión · ${p.nombre}`, (p.comision || 0) * d, p.quien);
  });
  push("cajaProyecto", CAJA_LABEL.cajaProyecto, r.cajaProj * d);
  push("cajaAhorro", CAJA_LABEL.cajaAhorro, r.cajaAhorro * d);
  push("banca", CAJA_LABEL.banca, (r.disc + r.utilSwept + r.comisBanca) * d);
  const montoRecibido = r.t * d;
  const suma = mv.reduce((a, m) => a + m.monto, 0);
  return { montoRecibido, movimientos: mv, cuadra: Math.abs(suma - montoRecibido) < 0.5 };
}

// Desembolso del pago #idx (en el orden almacenado en pr.pagos). Calcula el %
// acumulado antes/después y llama a desembolso(). Con N pagos nunca transfiere de
// más; el capeo a 1 protege contra sobrepagos del cliente.
export function desembolsoDePago(pr: Proyecto, R: Reglas, idx: number): Desembolso {
  const t = Math.max(0, +pr.ticket || 0);
  const pagos = pr.pagos || [];
  if (t <= 0 || idx < 0 || idx >= pagos.length) return { montoRecibido: 0, movimientos: [], cuadra: true };
  let antes = 0;
  for (let i = 0; i < idx; i++) antes += +pagos[i].monto || 0;
  const despues = antes + (+pagos[idx].monto || 0);
  return desembolso(pr, R, { pctPrev: Math.min(1, antes / t), pctAcum: Math.min(1, despues / t) });
}

// ── Cajas de Revolut: los movimientos del desembolso, agrupados en las cuentas
// reales donde el socio parquea el dinero. La Masa salarial junta a todo el equipo
// (sueldos) + comisiones; los socios y las cajas tienen su propia cuenta. ──
export type CajaKind = "masaSalarial" | "socioA" | "socioB" | "cajaProyecto" | "cajaAhorro" | "banca";
export const CAJA_ORDER: CajaKind[] = ["masaSalarial", "socioA", "socioB", "cajaProyecto", "cajaAhorro", "banca"];
export type CajaDetalle = { nombre: string; concepto: "sueldo" | "comisión" | "bono"; monto: number; quien?: Quien };
export type CajaGrupo = { caja: CajaKind; label: string; quien?: Quien; total: number; detalle: CajaDetalle[] };

const DESTINO_A_CAJA: Record<DestinoKind, CajaKind> = {
  equipo: "masaSalarial", comision: "masaSalarial", nucleoBono: "masaSalarial",
  socioA: "socioA", socioB: "socioB", cajaProyecto: "cajaProyecto", cajaAhorro: "cajaAhorro", banca: "banca",
};
export const cajaLabel = (c: CajaKind, R: Reglas): string =>
  c === "masaSalarial" ? "Masa salarial" : c === "socioA" ? R.nombreA : c === "socioB" ? R.nombreB
    : c === "cajaProyecto" ? "Caja del proyecto" : c === "cajaAhorro" ? "Caja de ahorro" : "La Banca";

// Toma los Movimiento del desembolso y los reparte en las 6 cajas de Revolut.
export function agrupaCajas(mv: Movimiento[], R: Reglas): CajaGrupo[] {
  const quienDe: Record<CajaKind, Quien | undefined> = {
    masaSalarial: undefined, socioA: "socioA", socioB: "socioB", cajaProyecto: undefined, cajaAhorro: undefined, banca: undefined,
  };
  const g: Record<CajaKind, CajaGrupo> = {} as Record<CajaKind, CajaGrupo>;
  CAJA_ORDER.forEach((c) => { g[c] = { caja: c, label: cajaLabel(c, R), quien: quienDe[c], total: 0, detalle: [] }; });
  mv.forEach((m) => {
    const c = DESTINO_A_CAJA[m.destino];
    g[c].total += m.monto;
    if (c === "masaSalarial") {
      const nombre = m.etiqueta.replace(/^(Equipo|Comisión|Bono) · /, "");
      const concepto: CajaDetalle["concepto"] = m.destino === "comision" ? "comisión" : m.destino === "nucleoBono" ? "bono" : "sueldo";
      g[c].detalle.push({ nombre, concepto, monto: m.monto, quien: m.quien });
    }
  });
  return CAJA_ORDER.map((c) => g[c]).filter((x) => x.total > 0.5);
}

export const fmtMXN = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v || 0);
export const pctFmt = (x: number) => (x * 100).toFixed(0) + "%";

// ── Helpers compartidos (app + rutas PDF) ──────────────────────────────────────
// El directorio de personas: fuente de verdad de nombre/tipo de cada integrante.
export type RosterPerson = { id: string; nombre: string; quien: Quien };

export const todayISO = () => new Date().toISOString().slice(0, 10);
// Aritmética de meses sobre "YYYY-MM-DD" → "YYYY-MM" (sin líos de zona horaria).
export const addMonths = (iso: string, k: number): string => {
  const [y, m] = iso.split("-").map(Number);
  const idx = y * 12 + (m - 1) + k;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
};
const MES_ABR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const mesLabel = (ym: string): string => { const [y, m] = ym.split("-").map(Number); return `${MES_ABR[m - 1]} ${String(y).slice(2)}`; };
export const mesDe = (fecha?: string | null): string => (fecha || "").slice(0, 7); // "YYYY-MM"

// Resuelve la identidad de cada miembro desde el roster (fuente de verdad): nombre y
// tipo salen del directorio, no de una copia vieja. Renombrar a alguien en Reglas se
// refleja en TODOS los proyectos al instante.
export function membersResolved(pr: Proyecto, roster: RosterPerson[], P: Reglas): Proyecto {
  const byId = new Map(roster.map((r) => [r.id, r]));
  const resolve = (m: Miembro): Miembro => {
    if (m.personId === "socioA") return { ...m, quien: "socioA" as Quien, nombre: P.nombreA, sm: 1 };
    if (m.personId === "socioB") return { ...m, quien: "socioB" as Quien, nombre: P.nombreB, sm: 1 };
    const rp = m.personId ? byId.get(m.personId) : undefined;
    if (rp) return { ...m, quien: rp.quien, nombre: rp.nombre, sm: rp.quien === "nuevo" ? P.smNuevo : 1 };
    return m; // legacy sin personId: usa lo guardado
  };
  const members = pr.members.map(resolve);
  let agenda = pr.agenda;
  if (agenda) {
    const a2: Record<number, Miembro[]> = {};
    for (const k of Object.keys(agenda)) a2[+k] = (Array.isArray(agenda[+k]) ? agenda[+k] : []).map(resolve);
    agenda = a2;
  }
  return agenda ? { ...pr, members, agenda } : { ...pr, members };
}

// Reglas con las que se calcula un proyecto. Un proyecto GUARDADO con foto propia
// (pr.reglas) se calcula con ESA foto — mover perillas en Reglas ya no lo toca. Los
// NOMBRES sí se toman de las Reglas vivas. Borradores/sin foto usan las Reglas vivas.
export function reglasDe(pr: Proyecto, params: Reglas): Reglas {
  if (pr.borrador || !pr.reglas) return params;
  // La tasa de ISR (imp) NO se congela: es una preferencia de "ver el neto" que
  // sale siempre de las Reglas vivas (como los nombres), no mueve el reparto.
  return { ...pr.reglas, nombreA: params.nombreA, nombreB: params.nombreB, imp: params.imp };
}
