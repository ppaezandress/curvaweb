// Cotizador de proyectos de consultoría (herramienta interna). Calcula el precio al
// cliente a partir de horas × tarifa × factor de área, reparte una bolsa al equipo por
// pesos de rol y muestra el margen. TODO parámetro vive en CotConfig (editable en la
// app, sincronizado en Supabase) — nada hardcodeado en la UI. Lógica pura y testeable.

export type CotArea = { id: string; nombre: string; peso: number }; // peso 1..5

export type CotConfig = {
  tarifaHoraBase: number;      // MXN/hora (placeholder, se está calibrando)
  pctEquipo: number;           // % del (precio − viáticos) que va al equipo
  pctPresencialidad: number;   // fee % sobre el subtotal si el proyecto es presencial
  pesoPiloto: number;
  pesoEspecialista: number;
  pesoApoyo: number;
  pilotoMin: number;           // rango sano del pago del piloto (para calibrar la tarifa)
  pilotoMax: number;
  areas: CotArea[];            // catálogo editable
};

export type CotForm = {
  areasSel: string[];          // ids de áreas elegidas
  presencial: boolean;
  transporte: number; tag: number; comida: number; // reembolso directo (solo si presencial)
  nEspecialista: number; nApoyo: number;           // el piloto es SIEMPRE 1
  horas: number;
};

export type CotResult = {
  pesoProm: number; areaFactor: number;
  subtotal: number; feePres: number; viaticos: number; precioCliente: number;
  poolEquipo: number; pesoTotal: number;
  pagoPiloto: number; pagoEspTotal: number; pagoApoyoTotal: number;
  pagoEspCada: number; pagoApoyoCada: number;
  margenBruto: number; pctMargen: number;
  pilotoFuera: boolean; nEsp: number; nApoyo: number;
};

export const COT_CONFIG_DEFAULT: CotConfig = {
  tarifaHoraBase: 500,
  pctEquipo: 40,
  pctPresencialidad: 15,
  pesoPiloto: 1.8,
  pesoEspecialista: 1.5,
  pesoApoyo: 1.0,
  pilotoMin: 7000,
  pilotoMax: 10000,
  areas: [
    { id: "a_estrategia", nombre: "Estrategia", peso: 5 },
    { id: "a_tecnologia", nombre: "Tecnología / Sistemas", peso: 5 },
    { id: "a_finanzas", nombre: "Finanzas / Contabilidad", peso: 3 },
    { id: "a_operacion", nombre: "Operación / Procesos", peso: 3 },
    { id: "a_comercial", nombre: "Comercial / Marketing", peso: 3 },
    { id: "a_cultura", nombre: "Cultura / RH", peso: 2 },
  ],
};

export const COT_FORM_DEFAULT: CotForm = {
  areasSel: [], presencial: false, transporte: 0, tag: 0, comida: 0,
  nEspecialista: 0, nApoyo: 0, horas: 0,
};

// Rellena defaults sobre lo guardado (perillas nuevas no rompen configs viejas).
export function mergeCotConfig(saved?: Partial<CotConfig> | null): CotConfig {
  const s = saved || {};
  const areas = Array.isArray(s.areas) && s.areas.length
    ? s.areas.map((a) => ({ id: a.id, nombre: a.nombre, peso: +a.peso || 0 }))
    : COT_CONFIG_DEFAULT.areas.map((a) => ({ ...a }));
  return {
    tarifaHoraBase: s.tarifaHoraBase ?? COT_CONFIG_DEFAULT.tarifaHoraBase,
    pctEquipo: s.pctEquipo ?? COT_CONFIG_DEFAULT.pctEquipo,
    pctPresencialidad: s.pctPresencialidad ?? COT_CONFIG_DEFAULT.pctPresencialidad,
    pesoPiloto: s.pesoPiloto ?? COT_CONFIG_DEFAULT.pesoPiloto,
    pesoEspecialista: s.pesoEspecialista ?? COT_CONFIG_DEFAULT.pesoEspecialista,
    pesoApoyo: s.pesoApoyo ?? COT_CONFIG_DEFAULT.pesoApoyo,
    pilotoMin: s.pilotoMin ?? COT_CONFIG_DEFAULT.pilotoMin,
    pilotoMax: s.pilotoMax ?? COT_CONFIG_DEFAULT.pilotoMax,
    areas,
  };
}

const n = (x: unknown) => Math.max(0, +(x as number) || 0);

export function cotizar(cfg: CotConfig, f: CotForm): CotResult {
  const areasSel = cfg.areas.filter((a) => f.areasSel.includes(a.id));
  // Sin áreas elegidas → peso neutro 3 (factor 1), para no romper el cálculo.
  const pesoProm = areasSel.length ? areasSel.reduce((s, a) => s + (+a.peso || 0), 0) / areasSel.length : 3;
  const areaFactor = 1 + (pesoProm - 3) * 0.1;

  const subtotal = n(f.horas) * n(cfg.tarifaHoraBase) * areaFactor;
  const feePres = f.presencial ? subtotal * (n(cfg.pctPresencialidad) / 100) : 0;
  const viaticos = f.presencial ? n(f.transporte) + n(f.tag) + n(f.comida) : 0;
  const precioCliente = subtotal + feePres + viaticos;

  const poolEquipo = (n(cfg.pctEquipo) / 100) * (precioCliente - viaticos);
  const nEsp = Math.max(0, Math.floor(n(f.nEspecialista)));
  const nApoyo = Math.max(0, Math.floor(n(f.nApoyo)));
  const pesoTotal = 1 * cfg.pesoPiloto + nEsp * cfg.pesoEspecialista + nApoyo * cfg.pesoApoyo;
  const share = (w: number) => (pesoTotal > 0 ? (w / pesoTotal) * poolEquipo : 0);
  const pagoPiloto = share(cfg.pesoPiloto);
  const pagoEspTotal = share(nEsp * cfg.pesoEspecialista);
  const pagoApoyoTotal = share(nApoyo * cfg.pesoApoyo);

  const margenBruto = precioCliente - viaticos - poolEquipo;
  const pctMargen = precioCliente > 0 ? margenBruto / precioCliente : 0;
  const pilotoFuera = poolEquipo > 0 && (pagoPiloto < cfg.pilotoMin || pagoPiloto > cfg.pilotoMax);

  return {
    pesoProm, areaFactor, subtotal, feePres, viaticos, precioCliente, poolEquipo, pesoTotal,
    pagoPiloto, pagoEspTotal, pagoApoyoTotal,
    pagoEspCada: nEsp > 0 ? pagoEspTotal / nEsp : 0,
    pagoApoyoCada: nApoyo > 0 ? pagoApoyoTotal / nApoyo : 0,
    margenBruto, pctMargen, pilotoFuera, nEsp, nApoyo,
  };
}
