// Casos de éxito (formato historia: reto → qué hicimos → resultado).
// YA NO son una sección de menú propia: se distribuyen dentro de cada área de
// consultoría y dentro de soluciones. `area` + `anchor` definen dónde vive y
// permiten deep-links (los usa el chat IA para "CURVA ya hizo esto → aquí").
import type { Accent } from './areas';

// Área a la que pertenece el caso (para distribuirlo y hacer deep-link).
export type CasoArea = 'transformacion-digital' | 'transformacion-de-negocio' | 'soluciones';

export interface Caso {
  categoria: string;
  accent: Accent;
  area: CasoArea;
  anchor: string;    // ancla del pilar/solución dentro de la página del área
  title: string;
  desc: string;
  reto: string;       // el problema con el que llegaron
  hicimos: string;    // qué construimos
  resultado: string;  // cómo quedó
  metrics: { value: string; label: string }[];
  quote: string;
  // PLACEHOLDER Tier 1 — pásame los datos reales (con permiso del cliente):
  autor?: { nombre: string; cargo: string; empresa: string; foto?: string };
  logo?: string;      // ruta a /public del logo del cliente
  href: string;       // deep-link a la sección del área
}

export const casos: Caso[] = [
  {
    categoria: 'Transformación Digital · Innovation',
    accent: 'ember',
    area: 'transformacion-digital',
    anchor: 'innovation',
    title: 'Retail y microcréditos en CDMX',
    desc: 'De tarjetas de papel a operación digital completa.',
    reto: 'Operaban con tarjetas de papel. Cada consulta tomaba horas y nadie tenía una foto real del negocio.',
    hicimos: 'Migramos todo a un ERP (Odoo): facturación, crédito digitalizado y estructura de roles.',
    resultado: 'Operación 100% digital en 4 meses. Lo que antes tardaba horas, hoy se resuelve en segundos.',
    metrics: [
      { value: '1,096', label: 'Facturas digitalizadas' },
      { value: '869', label: 'Clientes en sistema' },
      { value: '400+', label: 'Créditos migrados' },
      { value: '4 meses', label: 'De implementación' },
    ],
    quote: '"Hoy se resuelve en segundos lo que antes tomaba horas."',
    autor: { nombre: 'PENDIENTE', cargo: 'Dueño', empresa: 'PENDIENTE' }, // TODO: nombre + empresa + foto reales
    // logo: '/clientes/retail-cdmx.svg', // TODO: logo del cliente
    href: '/consultoria/transformacion-digital#innovation',
  },
  {
    categoria: 'Transformación Digital · Process Optimization',
    accent: 'gold',
    area: 'transformacion-digital',
    anchor: 'procesos',
    title: 'Agente IA para empresa de mensajería',
    desc: 'Un agente con IA que atiende y cotiza envíos solo.',
    reto: 'La atención dependía de quién estuviera disponible. Cotizar un envío tomaba tiempo y se caían ventas.',
    hicimos: 'Construimos un agente con IA integrado a su operación real: atiende a clientes y cotiza envíos al instante.',
    resultado: 'Atención 24/7 y cotizaciones automáticas, sin que nadie tenga que estar pendiente.',
    metrics: [
      { value: '24/7', label: 'Atención automatizada' },
      { value: 'Auto', label: 'Cotizaciones de envío' },
    ],
    quote: '"Respuesta inmediata y cotización sin esperar a nadie."',
    autor: { nombre: 'PENDIENTE', cargo: 'Director', empresa: 'PENDIENTE' }, // TODO: nombre + empresa + foto reales
    // logo: '/clientes/mensajeria.svg', // TODO: logo del cliente
    href: '/consultoria/transformacion-digital#procesos',
  },
];

// Casos de un área específica (para embeberlos dentro de su página).
export const casosDe = (area: CasoArea) => casos.filter((c) => c.area === area);
