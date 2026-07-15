// Mini-diagnóstico interactivo ("diagnóstico bebé") — idea de Diana (audio 2026-07-10).
// El usuario clica los problemas con los que se identifica → arquetipo + urgencia → CTA.
// Determinístico (sin IA): el score es suma de fichas por categoría. Espejo, no diagnóstico formal.
// Ver spec en Obsidian: "CURVA - Mini-diagnóstico interactivo (spec)".

export type CatId = 'operacion' | 'estrategia' | 'personas' | 'finanzas';
export type Eje = 'operativo' | 'estrategico';
export type ArquetipoId =
  | 'apagafuegos'
  | 'encrucijada'
  | 'motor_sin_tablero'
  | 'equipo_tension'
  | 'en_la_curva';

export interface Categoria {
  id: CatId;
  label: string;
  eje: Eje;
  arquetipo: ArquetipoId;
  /** Token de color de la marca (var CSS) para el acento de la ficha. */
  color: string;
}

export interface Ficha {
  id: string;
  cat: CatId;
  texto: string;
}

export interface Arquetipo {
  nombre: string;
  lectura: string;
  necesitas: string;
  /** Prueba social relevante: caso real de data/casos.ts (deep-link) o fallback a un área. */
  caso: { label: string; href: string };
}

// 4 categorías. El eje operativo↔estratégico define el "sesgo" secundario del resultado.
// Colores: cobalto / naranja / cian / marino — separados en matiz y dentro de la paleta
// "Cobalto & aire" (sin morado). Cambia una var si el núcleo prefiere otro acento.
export const categorias: Record<CatId, Categoria> = {
  operacion:  { id: 'operacion',  label: 'Operación',  eje: 'operativo',   arquetipo: 'apagafuegos',       color: 'var(--color-ember)' },
  estrategia: { id: 'estrategia', label: 'Estrategia', eje: 'estrategico', arquetipo: 'encrucijada',       color: 'var(--color-flare)' },
  personas:   { id: 'personas',   label: 'Equipo',     eje: 'operativo',   arquetipo: 'equipo_tension',    color: 'var(--color-jade)'  },
  finanzas:   { id: 'finanzas',   label: 'Finanzas',   eje: 'estrategico', arquetipo: 'motor_sin_tablero', color: 'var(--color-ink)'   },
};

// 16 fichas (4 por categoría). Redactadas en primera persona, tono dueño de PyME MX.
export const fichas: Ficha[] = [
  { id: 'op1', cat: 'operacion',  texto: 'Apago fuegos todo el día y no avanzo en lo importante' },
  { id: 'op2', cat: 'operacion',  texto: 'Todo pasa por mí; si no estoy, se frena' },
  { id: 'op3', cat: 'operacion',  texto: 'Los procesos viven en la cabeza de la gente, no escritos' },
  { id: 'op4', cat: 'operacion',  texto: 'Muchas juntas que no aterrizan en decisiones' },

  { id: 'es1', cat: 'estrategia', texto: 'No tengo claro el rumbo a 12 meses' },
  { id: 'es2', cat: 'estrategia', texto: 'Crecimos rápido y la estructura ya no da' },
  { id: 'es3', cat: 'estrategia', texto: 'Sé que algo tiene que cambiar, pero no sé por dónde empezar' },
  { id: 'es4', cat: 'estrategia', texto: 'Decidimos por intuición, casi sin datos' },

  { id: 'pe1', cat: 'personas',   texto: 'Mi gente está quemada o desmotivada' },
  { id: 'pe2', cat: 'personas',   texto: 'Se me va el talento clave' },
  { id: 'pe3', cat: 'personas',   texto: 'Mis líderes ejecutan, pero no lideran' },
  { id: 'pe4', cat: 'personas',   texto: 'Hay roces y silos entre áreas' },

  { id: 'fi1', cat: 'finanzas',   texto: 'Vendo más, pero no se refleja en la utilidad' },
  { id: 'fi2', cat: 'finanzas',   texto: 'No sé cuánto me cuesta cada cliente o producto' },
  { id: 'fi3', cat: 'finanzas',   texto: 'El flujo de caja me trae con el alma en un hilo' },
  { id: 'fi4', cat: 'finanzas',   texto: 'Quiero escalar, pero me da miedo perder el control' },
];

// Arquetipos de resultado. `caso` apunta a casos reales existentes (data/casos.ts) por
// deep-link; los que no tienen caso propio caen al área de consultoría relevante.
export const arquetipos: Record<ArquetipoId, Arquetipo> = {
  apagafuegos: {
    nombre: 'Modo Apagafuegos',
    lectura: 'El negocio te maneja a ti, no al revés. Vives en el día a día y lo importante se queda esperando.',
    necesitas: 'Ordenar procesos, sacar la operación de tu cabeza y delegar sin perder el control.',
    caso: { label: 'Un agente con IA que atiende y cotiza solo', href: '/consultoria/transformacion-digital#procesos' },
  },
  encrucijada: {
    nombre: 'En la Encrucijada',
    lectura: 'Sabes que algo grande tiene que cambiar y estás justo en el punto de decisión. La duda no es «si», es «hacia dónde».',
    necesitas: 'Claridad de rumbo, una estrategia a 12 meses y una estructura que la aguante.',
    caso: { label: 'Cómo trazamos el cambio con transformación de negocio', href: '/consultoria/transformacion-de-negocio' },
  },
  motor_sin_tablero: {
    nombre: 'Motor sin Tablero',
    lectura: 'Avanzas con fuerza, pero sin instrumentos: no ves con claridad qué te da dinero y qué te lo quita.',
    necesitas: 'Visibilidad financiera, entender tus costos reales y decidir con números, no con corazonadas.',
    caso: { label: 'De tarjetas de papel a operación 100% digital', href: '/consultoria/transformacion-digital#innovation' },
  },
  equipo_tension: {
    nombre: 'Equipo en Tensión',
    lectura: 'Tu gente es tu mayor activo y hoy es también tu mayor punto de fricción.',
    necesitas: 'Liderazgo real en tus mandos, cultura sana y una estrategia para retener al talento.',
    caso: { label: 'Cómo trabajamos negocio, estructura y cultura', href: '/consultoria/transformacion-de-negocio' },
  },
  en_la_curva: {
    nombre: 'En la Curva',
    lectura: 'Tienes varios frentes moviéndose a la vez. Estás, literalmente, en plena curva del cambio.',
    necesitas: 'Una lectura integral y un plan que ordene por dónde empezar. Justo lo que hace CURVA.',
    caso: { label: 'Conoce los dos frentes de la consultoría', href: '/consultoria/transformacion-de-negocio' },
  },
};

export interface Resultado {
  arquetipo: ArquetipoId;
  total: number;
  urgencia: 'baja' | 'media' | 'alta';
  eje: Eje;
  porCat: Record<CatId, number>;
}

// Lógica de scoring pura (testeable, sin DOM). La usa el script del componente.
export function calcular(seleccion: string[]): Resultado {
  const porCat: Record<CatId, number> = { operacion: 0, estrategia: 0, personas: 0, finanzas: 0 };
  for (const id of seleccion) {
    const f = fichas.find((x) => x.id === id);
    if (f) porCat[f.cat]++;
  }

  const total = seleccion.length;

  // Categoría dominante → arquetipo. Empate real (2+ categorías al máximo) → "en_la_curva".
  const max = Math.max(...Object.values(porCat));
  const lideres = (Object.keys(porCat) as CatId[]).filter((c) => porCat[c] === max && max > 0);
  const arquetipo: ArquetipoId =
    lideres.length === 1 ? categorias[lideres[0]].arquetipo : 'en_la_curva';

  // Sesgo del eje (dato secundario).
  const opuntos = porCat.operacion + porCat.personas;
  const espuntos = porCat.estrategia + porCat.finanzas;
  const eje: Eje = espuntos > opuntos ? 'estrategico' : 'operativo';

  const urgencia = total >= 6 ? 'alta' : total >= 3 ? 'media' : 'baja';

  return { arquetipo, total, urgencia, eje, porCat };
}
