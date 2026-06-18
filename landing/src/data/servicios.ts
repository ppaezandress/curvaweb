// Fuente única de los 7 servicios. La ruta dinámica servicios/[slug].astro
// renderiza un template consistente a partir de estos datos.
import type { Accent } from './areas';

export interface Bloque { title: string; desc: string; }
export interface Paso { num: string; title?: string; desc: string; }
export interface Herramienta { name: string; desc: string; }
export interface Metric { value: string; label: string; }
export interface CasoRef { name: string; desc: string; tags: string[]; links?: { label: string; href: string }[]; }
export interface VideoItem { src: string; label: string; }

export interface Servicio {
  slug: string;
  order: number;
  navLabel: string;
  title: string;
  tagline: string;
  headline: string;
  description: string;
  tags: string[];
  cta: string;
  accent: Accent;
  bloques?: { title: string; tone: 'dark' | 'light'; items: Bloque[] };
  herramientas?: { title: string; items: Herramienta[] };
  proceso?: { title: string; pasos: Paso[] };
  incluye?: { title: string; items: Bloque[] };
  resultados?: { title: string; items: Metric[] };
  casoDestacado?: { label: string; title: string; desc: string; metrics?: Metric[] };
  video?: { eyebrow: string; title: string; desc: string; src: string };
  casos?: { title: string; items: CasoRef[] };
  galeria?: { title: string; items: VideoItem[] };
  senales?: { title: string; items: string[] };
}

export const servicios: Servicio[] = [
  {
    slug: 'diagnostico',
    order: 1,
    navLabel: 'Consultoría y estructura',
    title: 'Consultoría y estructura',
    tagline: 'Consultoría y estructura',
    headline: 'Entendemos tu negocio como realmente opera.',
    description: 'Nos metemos al día a día con tu equipo para encontrar las causas raíz, no los síntomas.',
    tags: ['Diagnóstico', 'Procesos', 'Gobernanza', 'Cultura y liderazgo', 'Roles y organigrama', 'Gestión del cambio'],
    cta: '¿Listo para saber qué le pasa a tu empresa de verdad?',
    accent: 'ember',
    bloques: {
      title: 'Áreas que cubrimos',
      tone: 'dark',
      items: [
        { title: 'Diagnóstico organizacional', desc: 'Mapeamos la operación real para encontrar los problemas de raíz.' },
        { title: 'Procesos y estructura', desc: 'Flujos claros que cualquier persona nueva puede seguir.' },
        { title: 'Gobernanza', desc: 'Cómo se toman decisiones y se resuelven conflictos entre socios.' },
        { title: 'Cultura y liderazgo', desc: 'Desarrollo de líderes y gestión del cambio acompañada.' },
      ],
    },
    proceso: {
      title: 'Cómo funciona',
      pasos: [
        { num: '01', desc: 'Convivimos con tu equipo: entrevistas, observación, datos reales.' },
        { num: '02', desc: 'Mapeamos la operación real, no la del manual.' },
        { num: '03', desc: 'Entregamos un diagnóstico con prioridades y ruta por módulos.' },
      ],
    },
    senales: {
      title: 'Señales de que necesitas esto',
      items: [
        'Cuando alguien falta, nadie sabe cómo hacer su trabajo.',
        'Los errores se repiten porque no hay proceso definido.',
        'El fundador toma todas las decisiones y no puede soltar.',
        'Hay conflictos entre socios que frenan el crecimiento.',
      ],
    },
  },
  {
    slug: 'digitalizacion',
    order: 2,
    navLabel: 'Digitalización y automatización',
    title: 'Digitalización y automatización',
    tagline: 'Digitalización y automatización',
    headline: 'Tu operación en un solo sistema. De verdad.',
    description: 'ERPs, automatizaciones y agentes con IA que tu equipo realmente usa. Toda tu operación, conectada.',
    tags: ['ERPs', 'Agentes con IA', 'Automatización', 'Integraciones', 'Capacitación', 'Soporte continuo'],
    cta: '¿Listo para que tu operación funcione en automático?',
    accent: 'gold',
    herramientas: {
      title: 'Herramientas que dominamos',
      items: [
        { name: 'Odoo', desc: 'ERP completo' },
        { name: 'n8n', desc: 'Automatización de flujos' },
        { name: 'OpenAI / Claude', desc: 'Agentes inteligentes' },
        { name: 'Shopify', desc: 'E-commerce' },
        { name: 'WhatsApp API', desc: 'Mensajería automatizada' },
        { name: 'Google Workspace', desc: 'Productividad' },
        { name: 'Vercel / Astro', desc: 'Web y landing pages' },
        { name: 'Cal.com', desc: 'Agendamiento' },
      ],
    },
    bloques: {
      title: 'Lo que construimos',
      tone: 'dark',
      items: [
        { title: 'Agentes con IA', desc: 'Atienden clientes, cotizan y escalan cuando es necesario.' },
        { title: 'Automatizaciones', desc: 'Eliminan tareas repetitivas sin intervención manual.' },
        { title: 'ERPs implementados de verdad', desc: 'Migración, configuración, capacitación y soporte.' },
        { title: 'Integraciones', desc: 'Conectamos las herramientas que ya usas para que hablen entre sí.' },
      ],
    },
    resultados: {
      title: 'Resultados de un proyecto',
      items: [
        { value: '1,096', label: 'Facturas digitalizadas' },
        { value: '869', label: 'Clientes migrados a sistema' },
        { value: '400+', label: 'Créditos digitalizados' },
      ],
    },
  },
  {
    slug: 'marketing',
    order: 3,
    navLabel: 'Marketing y contenido',
    title: 'Marketing y contenido',
    tagline: 'Marketing y contenido',
    headline: 'Estrategia, contenido y ejecución. No solo ideas.',
    description: 'Desde la estrategia de marca hasta la grabación y publicación. Contenido que conecta, no que llena espacio.',
    tags: ['Estrategia de contenido', 'Marca personal', 'Redes sociales', 'Video', 'Posicionamiento de fundador'],
    cta: '¿Tu marca comunica lo que tu empresa realmente es?',
    accent: 'jade',
    video: {
      eyebrow: 'Desde el fundador',
      title: 'La importancia de tener contenido de calidad',
      desc: 'El contenido que representa a tu marca tiene que ser intencional, auténtico y estratégico.',
      src: '/andres-contenido.mp4',
    },
    proceso: {
      title: 'Nuestro proceso',
      pasos: [
        { num: '01', title: 'Estrategia', desc: 'Qué comunicar, a quién y en qué tono.' },
        { num: '02', title: 'Producción', desc: 'Grabamos, editamos y producimos, listo para publicar.' },
        { num: '03', title: 'Gestión', desc: 'Publicamos, monitoreamos y ajustamos.' },
      ],
    },
    incluye: {
      title: 'Qué incluye',
      items: [
        { title: 'Marca personal para fundadores', desc: 'Posicionamos al líder como referente en su industria.' },
        { title: 'Manejo integral de redes', desc: 'Calendario, creación de contenido y community management.' },
        { title: 'Producción de video', desc: 'Reels, entrevistas y contenido educativo con narrativa.' },
        { title: 'Estrategia de contenido', desc: 'Cada pieza con un objetivo claro.' },
      ],
    },
    casos: {
      title: 'Proyectos recientes',
      items: [
        { name: 'Green Earth', desc: 'Videos de marca personal para posicionar al fundador como referente.', tags: ['Video', 'Marca personal', 'Estrategia'] },
        { name: 'Natsu Life Bambú', desc: 'Gestión completa de redes con contenido constante y fiel a la marca.', tags: ['Redes sociales', 'Grabación', 'Edición'], links: [{ label: 'Instagram', href: 'https://www.instagram.com/natsulifebambu/' }, { label: 'Sitio web', href: 'https://natsulife.com' }] },
      ],
    },
    galeria: {
      title: 'Ejemplos de nuestro trabajo',
      items: [
        { src: '/marketing-demo.mp4', label: 'Natsu Life Bambú' },
        { src: '/greenearth-1.mp4', label: 'Green Earth' },
        { src: '/greenearth-2.mp4', label: 'Green Earth' },
        { src: '/bts-1.mp4', label: 'Detrás de cámaras' },
        { src: '/evento-1.mp4', label: 'Evento' },
        { src: '/meraki-1.mp4', label: 'Meraki Home' },
        { src: '/meraki-2.mp4', label: 'Meraki Home' },
        { src: '/bts-evento.mp4', label: 'BTS Evento' },
        { src: '/natsu-2.mp4', label: 'Natsu Life Bambú' },
      ],
    },
  },
  {
    slug: 'automatizacion',
    order: 4,
    navLabel: 'Automatización e IA',
    title: 'Automatización e IA',
    tagline: 'Automatización e inteligencia artificial',
    headline: 'Agentes de IA y automatizaciones que trabajan por ti.',
    description: 'Soluciones en producción —no demos— que atienden clientes, cotizan y ejecutan tareas repetitivas.',
    tags: ['Agentes con IA', 'Atención 24/7', 'Cotizaciones automáticas', 'Flujos con n8n', 'Integración con WhatsApp'],
    cta: '¿Cuántas horas pierde tu equipo en tareas repetitivas?',
    accent: 'gold',
    casoDestacado: {
      label: 'Caso real',
      title: 'Agente IA para empresa de mensajería',
      desc: 'Atiende clientes automáticamente y genera cotizaciones de envíos al instante, integrado a la operación real.',
      metrics: [
        { value: '24/7', label: 'Atención sin interrupciones' },
        { value: 'Segundos', label: 'Tiempo de respuesta' },
        { value: 'Auto', label: 'Cotizaciones de envío' },
      ],
    },
  },
  {
    slug: 'procesos',
    order: 5,
    navLabel: 'Procesos y estructura',
    title: 'Procesos y estructura',
    tagline: 'Procesos y estructura',
    headline: 'Que el negocio funcione sin depender de la memoria de nadie.',
    description: 'Flujos claros, roles definidos y un sistema que cualquier persona nueva puede seguir desde el día uno.',
    tags: ['Flujos operativos', 'Roles y responsabilidades', 'Manuales de operación', 'KPIs por área', 'Onboarding'],
    cta: '¿Tu operación depende de personas específicas?',
    accent: 'ember',
    senales: {
      title: 'Señales de que necesitas esto',
      items: [
        'Cuando alguien falta, nadie sabe cómo hacer su trabajo.',
        'Los errores se repiten porque no hay proceso escrito.',
        'Cada persona hace las cosas "a su manera".',
        'No hay forma de medir si algo se hizo bien.',
      ],
    },
  },
  {
    slug: 'cultura',
    order: 6,
    navLabel: 'Cultura y liderazgo',
    title: 'Cultura y liderazgo',
    tagline: 'Cultura y liderazgo',
    headline: 'El cambio real pasa por las personas.',
    description: 'Trabajamos con tus líderes para construir una cultura que soporte el crecimiento. No es coaching: es transformación acompañada.',
    tags: ['Desarrollo de líderes', 'Gestión del cambio', 'Comunicación interna', 'Definición de valores', 'Talento'],
    cta: '¿Tu equipo tiene la cultura para sostener el crecimiento?',
    accent: 'jade',
    incluye: {
      title: 'Lo que trabajamos con tu equipo',
      items: [
        { title: 'Líderes que lideran', desc: 'Que inspiran, comunican y desarrollan a su gente.' },
        { title: 'Cambio que se sostiene', desc: 'Para que las transformaciones no se queden en el papel.' },
        { title: 'Cultura con propósito', desc: 'Valores que se viven, no que están en la pared.' },
      ],
    },
  },
  {
    slug: 'gobernanza',
    order: 7,
    navLabel: 'Gobernanza',
    title: 'Gobernanza',
    tagline: 'Gobernanza y toma de decisiones',
    headline: 'Decisiones con estructura, no con urgencia.',
    description: 'Un sistema de gobierno claro: quién decide qué y cómo se resuelven los conflictos. Ideal para empresas familiares o con varios socios.',
    tags: ['Gobierno corporativo', 'Acuerdos entre socios', 'Comités y juntas', 'Protocolos de decisión', 'Resolución de conflictos'],
    cta: '¿Las decisiones dependen de quién grita más fuerte?',
    accent: 'ember',
    bloques: {
      title: 'Para quién es esto',
      tone: 'dark',
      items: [
        { title: 'Empresas familiares', desc: 'Donde los roles de familia y negocio se mezclan.' },
        { title: 'Empresas con varios socios', desc: 'Donde cada fundador tiene una visión distinta.' },
        { title: 'Empresas en crecimiento', desc: 'Donde el fundador ya no puede decidir todo solo.' },
        { title: 'Empresas que se profesionalizan', desc: 'Que pasan de "el jefe decide todo" a un sistema real.' },
      ],
    },
  },
];

export const getServicio = (slug: string) => servicios.find((s) => s.slug === slug);
export const prevNext = (slug: string) => {
  const ordered = [...servicios].sort((a, b) => a.order - b.order);
  const i = ordered.findIndex((s) => s.slug === slug);
  return {
    prev: ordered[(i - 1 + ordered.length) % ordered.length],
    next: ordered[(i + 1) % ordered.length],
  };
};
