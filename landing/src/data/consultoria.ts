// Fuente única de los 2 FRENTES de Consultoría. Cada frente es UNA página
// (/consultoria/[slug]) con sus pilares apilados y anclados; el mega-menú
// enlaza directo a cada pilar dentro de la misma página.
// Contenido dictado en el PROMPT MAESTRO — no inventar fuera de eso.
import type { Accent } from './areas';

export interface Pilar {
  id: string;         // ancla (#id) que casa con el mega-menú
  titulo: string;
  subtitulo: string;  // descripción corta y clara
  ejemplo?: string;   // "Ejemplo: ..." (frente de Negocio)
  bullets: string[];  // lo que cubre el pilar
  revisar?: boolean;  // copy marcado para revisión del usuario
}

export interface Credencial {
  tipo: string;   // Curso / Diploma / Workshop / Certificación
  nombre: string;
  emisor?: string;
  pendiente?: boolean; // slot a completar (p. ej. re-certificación)
}

export interface FrenteConsultoria {
  slug: string;
  order: number;
  navLabel: string;
  eyebrow: string;
  title: string;      // nombre del frente
  headline: string;   // hero de área (autoexplicable)
  description: string;
  accent: Accent;
  destacado?: boolean; // Transformación Digital = frente prioritario de arranque
  pilares: Pilar[];
  ctaPilar: string;    // CTA por pilar ("¿Crees que esto es para ti? ...")
  credenciales: { title: string; intro: string; items: Credencial[] };
}

export const frentes: FrenteConsultoria[] = [
  {
    slug: 'transformacion-digital',
    order: 1,
    navLabel: 'Transformación Digital',
    eyebrow: 'Consultoría · Transformación Digital',
    title: 'Transformación Digital',
    headline: 'Tu operación, digital y conectada de punta a punta.',
    description:
      'Ordenamos cómo consigues clientes, con qué sistemas trabajas por dentro y qué tanto de tu día a día corre en automático. La tecnología no llega sola: viene con capacitación y acompañamiento hasta que tu equipo la hace suya.',
    accent: 'ember',
    destacado: true,
    ctaPilar: '¿Crees que esto es para ti? Búscanos y lo vemos juntos.',
    pilares: [
      {
        id: 'customers',
        titulo: 'Clientes y marketing',
        subtitulo: 'Cómo consigues, entiendes y conservas a tus clientes.',
        bullets: [
          'CRMs',
          'Neuromarketing',
          'Segmentación de audiencias',
          'Contenido',
          'GEO, SEO y ASO',
          'SEM',
          'UX y UI',
          'Optimización de precios',
          'Sistemas de gestión',
        ],
      },
      {
        id: 'innovation',
        titulo: 'Innovación',
        subtitulo: 'Los sistemas de información que ordenan cómo trabajas por dentro. Un sistema de información es Odoo o Notion.',
        bullets: [
          'Sistemas de información (Odoo, Notion)',
          'Agilidad en los procesos',
          'Modelos de negocio digitales',
        ],
      },
      {
        id: 'procesos',
        titulo: 'Optimización de procesos',
        subtitulo: 'Menos trabajo manual y repetitivo, más operación en automático.',
        bullets: [
          'Automatización de marketing',
          'Mapa del recorrido del cliente (CJM)',
          'Reducción de costos',
          'E-commerce',
        ],
      },
    ],
    credenciales: {
      title: 'Con qué nos hemos preparado',
      intro: 'No improvisamos. Nos formamos con quienes están a la vanguardia de esto.',
      items: [
        { tipo: 'Cursos', nombre: 'Cursos de Anthropic', emisor: 'Anthropic' },
        { tipo: 'Curso', nombre: 'Claude Code', emisor: 'Anthropic' },
        { tipo: 'Certificación', nombre: 'Certificación de Notion', emisor: 'Notion' },
        { tipo: 'Certificación', nombre: 'Re-certificación de Notion', pendiente: true },
      ],
    },
  },
  {
    slug: 'transformacion-de-negocio',
    order: 2,
    navLabel: 'Transformación de Negocio',
    eyebrow: 'Consultoría · Transformación de Negocio',
    title: 'Transformación de Negocio',
    headline: 'Ordena el rumbo, la gente y la forma de trabajar.',
    description:
      'Definimos hacia dónde va el negocio, preparamos al equipo para el cambio y dejamos los procesos claros. Para que la empresa crezca con estructura y no dependa de la memoria de nadie.',
    accent: 'gold',
    ctaPilar: '¿Crees que esto es para ti? Búscanos y lo vemos juntos.',
    pilares: [
      {
        id: 'estrategia',
        titulo: 'Estrategia y modelo operativo',
        subtitulo: 'Define el rumbo del negocio y cómo se organiza el trabajo.',
        ejemplo: 'Ejemplo: crear un plan para vender por internet o cambiar la estructura de los empleados.',
        bullets: [
          'Rumbo y prioridades del negocio',
          'Modelo operativo y estructura de equipo',
          'Gobernanza: quién decide qué',
        ],
      },
      {
        id: 'personas',
        titulo: 'Personas y cultura',
        subtitulo: 'Prepara al equipo para aceptar y liderar los cambios diarios.',
        ejemplo: 'Ejemplo: dar cursos de capacitación, mejorar la comunicación interna o motivar al personal.',
        bullets: [
          'Capacitación del equipo',
          'Comunicación interna',
          'Liderazgo y motivación',
        ],
      },
      {
        id: 'procesos',
        titulo: 'Procesos',
        // PENDIENTE #5 — subtítulo propuesto, marcado para revisión del usuario.
        subtitulo: 'Ordena el día a día para que el trabajo fluya igual, lo haga quien lo haga.',
        ejemplo: 'Ejemplo: definir cómo se realiza cada tarea clave y quién responde por ella.',
        bullets: [
          'Flujos de trabajo claros',
          'Roles y responsabilidades',
          'Manuales y estándares de operación',
        ],
        revisar: true,
      },
    ],
    credenciales: {
      title: 'Con qué nos hemos preparado',
      intro: 'No improvisamos. Nos formamos con quienes están a la vanguardia de esto.',
      items: [
        { tipo: 'Formación', nombre: 'Estrategia y Transformación de Negocios', emisor: 'Tec de Monterrey' },
        { tipo: 'Cursos', nombre: 'Cursos de Anthropic', emisor: 'Anthropic' },
        { tipo: 'Certificación', nombre: 'Certificación de Notion', emisor: 'Notion' },
      ],
    },
  },
];

export const getFrente = (slug: string) => frentes.find((f) => f.slug === slug);
export const otroFrente = (slug: string) => frentes.find((f) => f.slug !== slug);
