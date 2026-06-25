// Casos de éxito mostrados en el carrusel de la home.
import type { Accent } from './areas';

export interface Caso {
  categoria: string;
  accent: Accent;
  title: string;
  desc: string;
  metrics: { value: string; label: string }[];
  quote: string;
  href: string;
}

export const casos: Caso[] = [
  {
    categoria: 'Consultoría y estructura',
    accent: 'ember',
    title: 'Retail y microcréditos en CDMX',
    desc: 'De tarjetas de papel a operación digital completa. ERP, crédito digitalizado, gobernanza y estructura organizacional.',
    metrics: [
      { value: '1,096', label: 'Facturas digitalizadas' },
      { value: '869', label: 'Clientes en sistema' },
      { value: '400+', label: 'Créditos migrados' },
      { value: '4 meses', label: 'De implementación' },
    ],
    quote: '"Hoy se resuelve en segundos lo que antes tomaba horas."',
    href: '/servicios/diagnostico',
  },
  {
    categoria: 'Digitalización y automatización',
    accent: 'gold',
    title: 'Agente IA para empresa de mensajería',
    desc: 'Agente con inteligencia artificial para atención a clientes y cotización automática de envíos. Integrado al flujo real de operación.',
    metrics: [
      { value: '24/7', label: 'Atención automatizada' },
      { value: 'Auto', label: 'Cotizaciones de envío' },
    ],
    quote: '"Respuesta inmediata y cotización sin esperar a nadie."',
    href: '/servicios/digitalizacion',
  },
  // Casos de "Marketing y contenido" (Green Earth, Natsu Life Bambú) ocultos
  // de la home junto con el eje de marketing (jun 2026). Siguen disponibles
  // dentro de la página /servicios/marketing.
];
