// Casos mostrados en la home (formato historia: reto → qué hicimos → resultado).
import type { Accent } from './areas';

export interface Caso {
  categoria: string;
  accent: Accent;
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
  href: string;
}

export const casos: Caso[] = [
  {
    categoria: 'Consultoría y estructura',
    accent: 'ember',
    title: 'Retail y microcréditos en CDMX',
    desc: 'De tarjetas de papel a operación digital completa.',
    reto: 'Operaban con tarjetas de papel. Cada consulta tomaba horas y nadie tenía una foto real del negocio.',
    hicimos: 'Migramos todo a un ERP: facturación, crédito digitalizado, gobernanza y estructura de roles.',
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
    href: '/servicios/diagnostico',
  },
  {
    categoria: 'Digitalización y automatización',
    accent: 'gold',
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
    href: '/servicios/digitalizacion',
  },
  // Casos de "Marketing y contenido" (Green Earth, Natsu Life Bambú) ocultos
  // de la home junto con el eje de marketing (jun 2026). Siguen disponibles
  // dentro de la página /servicios/marketing.
];
