// Las 3 áreas de trabajo de CURVA (tarjetas de la home).
// Cada una se combina según lo que la empresa necesite.
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
}

export const areas: Area[] = [
  {
    title: 'Consultoría y estructura',
    desc: 'Diagnóstico, procesos, gobernanza, cultura, liderazgo y roles. Todo lo que necesitas para que tu empresa funcione por sistema, no por esfuerzo.',
    href: '/servicios/diagnostico',
    accent: 'ember',
    icon: 'compass',
    tags: ['Diagnóstico', 'Procesos', 'Gobernanza', 'Cultura', 'Liderazgo'],
    images: [
      { src: '/organigrama-pro.svg', alt: 'Organigrama profesional' },
      { src: '/diagnostico-preview.svg', alt: 'Reporte de diagnóstico' },
      { src: '/mapa-procesos.svg', alt: 'Mapa de procesos' },
    ],
    menuLabel: 'Consultoría y estructura',
    menuDesc: 'Diagnóstico, procesos, gobernanza, cultura',
  },
  {
    title: 'Digitalización y automatización',
    desc: 'ERPs, sistemas, agentes con IA, automatización de flujos. Herramientas que realmente se usan y transforman tu operación.',
    href: '/servicios/digitalizacion',
    accent: 'gold',
    icon: 'bolt',
    tags: ['ERPs / Odoo', 'Automatización', 'Agentes IA', 'Integraciones'],
    images: [
      { src: '/digital-2.png', alt: 'Automatización con IA' },
      { src: '/digital-1.png', alt: 'Dashboard de ventas' },
    ],
    menuLabel: 'Digitalización y automatización',
    menuDesc: 'ERPs, agentes IA, integraciones',
  },
  {
    title: 'Marketing y contenido',
    desc: 'Estrategia de marca, videos, redes sociales, marca personal. Contenido que conecta y posiciona, no que llena espacio.',
    href: '/servicios/marketing',
    accent: 'jade',
    icon: 'spark',
    tags: ['Redes sociales', 'Video', 'Marca personal', 'Estrategia'],
    videos: [
      '/marketing-demo.mp4',
      '/greenearth-1.mp4',
      '/evento-1.mp4',
      '/meraki-1.mp4',
      '/bts-1.mp4',
      '/natsu-2.mp4',
      '/bts-evento.mp4',
    ],
    menuLabel: 'Marketing y contenido',
    menuDesc: 'Redes, video, marca personal',
  },
];
