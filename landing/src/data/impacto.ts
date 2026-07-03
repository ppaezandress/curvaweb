// Módulo "Impacto real" — tarjetas con estadística grande (estilo consultora).
// La cifra es la protagonista: prueba concreta de lo que cambia una operación.
//
// ⚠️ HONESTIDAD: los casos marcados `ejemplo: true` son PLACEHOLDER — cifras
// ilustrativas para mostrar la estructura. Se reemplazan por casos reales (con
// permiso del cliente). Los dos primeros salen de data/casos.ts (hechos reales,
// autor pendiente). Pásame cifras/clientes reales y quito el marcador.
import type { Accent } from './areas';

export interface ImpactoCaso {
  stat: string;        // la cifra protagonista (ej. '−73%', '4 meses', '2.4×')
  statLabel: string;   // qué mide la cifra
  categoria: string;   // etiqueta de área/capacidad
  accent: Accent;      // color de la cabecera
  title: string;       // la transformación, en una línea
  desc: string;        // contexto corto (1–2 líneas)
  href: string;        // deep-link al caso/área
  ejemplo?: boolean;   // true = cifra ilustrativa (placeholder)
}

export const impacto: ImpactoCaso[] = [
  {
    stat: '4 meses',
    statLabel: 'a operación 100% digital',
    categoria: 'Transformación Digital',
    accent: 'ember',
    title: 'De tarjetas de papel a un ERP completo',
    desc: 'Retail y microcréditos en CDMX. Lo que tomaba horas, hoy se resuelve en segundos.',
    href: '/consultoria/transformacion-digital#innovation',
  },
  {
    stat: '24/7',
    statLabel: 'atención y cotización automáticas',
    categoria: 'Agentes con IA',
    accent: 'jade',
    title: 'Un agente de IA que atiende y cotiza solo',
    desc: 'Empresa de mensajería. Cero ventas caídas por no contestar a tiempo.',
    href: '/consultoria/transformacion-digital#procesos',
  },
  {
    stat: '−73%',
    statLabel: 'menos tiempo en reportes',
    categoria: 'Automatización',
    accent: 'flare',
    title: 'Reportes que antes comían días, ahora en minutos',
    desc: 'Conectamos las fuentes y el tablero se arma solo, sin copiar-pegar.',
    href: '/consultoria/transformacion-digital',
    ejemplo: true,
  },
  {
    stat: '2 h',
    statLabel: 'para dar de alta un cliente (antes: 3 días)',
    categoria: 'Procesos',
    accent: 'ember',
    title: 'Onboarding sin cuellos de botella',
    desc: 'Ordenamos el flujo y quitamos los pasos que solo generaban espera.',
    href: '/consultoria/transformacion-de-negocio#procesos',
    ejemplo: true,
  },
  {
    stat: '2.4×',
    statLabel: 'ventas en línea en 6 meses',
    categoria: 'Soluciones digitales',
    accent: 'jade',
    title: 'Una tienda que sí convierte',
    desc: 'Del catálogo estático a una operación de e-commerce que crece sola.',
    href: '/soluciones',
    ejemplo: true,
  },
  {
    stat: '0',
    statLabel: 'procesos que dependen de una sola persona',
    categoria: 'Gobernanza',
    accent: 'flare',
    title: 'El negocio deja de depender del dueño',
    desc: 'Roles claros y procesos documentados: cada quien sabe qué hacer.',
    href: '/consultoria/transformacion-de-negocio',
    ejemplo: true,
  },
];
