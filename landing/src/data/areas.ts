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
    desc: 'Diagnóstico, procesos, gobernanza, cultura y roles. Le ponemos orden a cómo funciona tu empresa por dentro.',
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
    desc: 'ERPs, automatización y agentes con IA. Tecnología que tu equipo sí usa, no que junta polvo.',
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
  // Nota: "Marketing y contenido" se ocultó de la home y del menú (jun 2026)
  // mientras el equipo no pueda sostener la calidad deseada. La página
  // /servicios/marketing sigue viva en data/servicios.ts; para reactivarlo
  // basta con volver a agregar aquí el área (accent 'jade', icon 'spark').
];
