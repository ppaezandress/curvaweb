// Las 3 áreas de trabajo de CURVA (tarjetas de la home + footer).
// Consultoría se divide en 2 frentes (Digital y de Negocio) + Soluciones digitales.
// Cada área tiene su propia página que se entiende sola (se puede mandar como link de venta).
export type Accent = 'ember' | 'gold' | 'jade';

export interface Area {
  title: string;
  desc: string;
  href: string;
  accent: Accent;
  icon: 'compass' | 'bolt' | 'spark';
  tags: string[];
  images?: { src: string; alt: string }[];
  videos?: string[];
  menuLabel: string;
  menuDesc: string;
  destacado?: boolean; // frente prioritario de arranque (Transformación Digital)
  grupo: 'consultoria' | 'soluciones';
}

export const areas: Area[] = [
  {
    title: 'Transformación Digital',
    desc: 'CRMs, sistemas como Odoo y Notion, automatización y agentes con IA. Tu operación digital y conectada de punta a punta.',
    href: '/consultoria/transformacion-digital',
    accent: 'ember',
    icon: 'bolt',
    tags: ['CRMs', 'Odoo / Notion', 'Automatización', 'Agentes IA', 'E-commerce'],
    menuLabel: 'Transformación Digital',
    menuDesc: 'Clientes, sistemas y automatización',
    destacado: true,
    grupo: 'consultoria',
  },
  {
    title: 'Transformación de Negocio',
    desc: 'Estrategia, modelo operativo, personas y procesos. Le ponemos rumbo y orden a cómo funciona tu empresa por dentro.',
    href: '/consultoria/transformacion-de-negocio',
    accent: 'gold',
    icon: 'compass',
    tags: ['Estrategia', 'Modelo operativo', 'Personas y cultura', 'Procesos'],
    menuLabel: 'Transformación de Negocio',
    menuDesc: 'Estrategia, personas y procesos',
    grupo: 'consultoria',
  },
  {
    title: 'Soluciones digitales',
    desc: 'Páginas web, sistemas y apps a la medida, clases de Claude y Notion, y plantillas listas para comprar.',
    href: '/soluciones',
    accent: 'jade',
    icon: 'spark',
    tags: ['Páginas web', 'Apps a la medida', 'Clases', 'Plantillas'],
    menuLabel: 'Soluciones digitales',
    menuDesc: 'Web, apps, clases y plantillas',
    grupo: 'soluciones',
  },
];
