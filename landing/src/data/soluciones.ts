// Soluciones digitales: entregables que NO requieren meternos a la
// infraestructura del cliente (esa es la frontera con Consultoría).
// Comunicamos capacidad y resultado, NUNCA el "cómo" (nada de vibe coding).
import type { Accent } from './areas';

export interface Plantilla {
  id: string;
  nombre: string;
  desc: string;
  precio: string;        // texto mostrado (p. ej. "$490 MXN")
  precioMXN: number;     // monto para el checkout
  // La compra vive en la página: pagas → te llega al correo → listo.
}

export interface Solucion {
  id: string;            // ancla (#id) que casa con el mega-menú
  titulo: string;
  subtitulo: string;
  bullets?: string[];
  accent: Accent;
  icon: 'globe' | 'cube' | 'claude' | 'notion' | 'template';
  cta?: { label: string; href: string };
  destacado?: boolean;
  tienda?: boolean;      // plantillas Notion con compra integrada
  plantillas?: Plantilla[];
}

export const soluciones: Solucion[] = [
  {
    id: 'web',
    titulo: 'Páginas web',
    subtitulo: 'Sitios rápidos, a tu marca y pensados para vender. No plantillas genéricas.',
    accent: 'ember',
    icon: 'globe',
    bullets: ['Diseño a la medida de tu marca', 'Rápidas y optimizadas', 'Listas para convertir'],
  },
  {
    id: 'sistemas',
    titulo: 'Sistemas y apps a la medida',
    subtitulo: 'Software hecho para tu operación, incluso sistemas complejos. De punta a punta, con un solo aliado — no necesitas a nadie más.',
    accent: 'gold',
    icon: 'cube',
    bullets: ['Sistemas y apps a la medida', 'Integrado a como ya trabajas', 'De la idea a producción, contigo'],
    destacado: true,
  },
  {
    id: 'clases-claude',
    titulo: 'Clases de Claude',
    subtitulo: 'Aprende a usar IA de verdad en tu negocio, con casos reales y a tu ritmo.',
    accent: 'jade',
    icon: 'claude',
    // TODO: URL real de "Clases de Claude" (hoy #).
    cta: { label: 'Ver las clases', href: '#' },
  },
  {
    id: 'clases-notion',
    titulo: 'Clases de Notion',
    subtitulo: 'Ordena tu trabajo y el de tu equipo en Notion, desde cero hasta sistemas completos.',
    accent: 'jade',
    icon: 'notion',
    cta: { label: 'Ver las clases', href: '#' },
  },
  {
    id: 'plantillas',
    titulo: 'Plantillas de Notion',
    subtitulo: 'Cómpralas aquí mismo: pagas, te llegan al correo y listo.',
    accent: 'ember',
    icon: 'template',
    tienda: true,
    plantillas: [
      // PLACEHOLDER — reemplazar por las plantillas y precios reales.
      { id: 'crm-simple', nombre: 'CRM simple', desc: 'Lleva tus clientes y ventas sin perder el hilo.', precio: '$490 MXN', precioMXN: 490 },
      { id: 'operacion-pyme', nombre: 'Operación PyME', desc: 'Tareas, procesos y equipo en un solo lugar.', precio: '$690 MXN', precioMXN: 690 },
      { id: 'finanzas-negocio', nombre: 'Finanzas del negocio', desc: 'Ingresos, gastos y flujo, claros cada mes.', precio: '$590 MXN', precioMXN: 590 },
    ],
  },
];

export const getSolucion = (id: string) => soluciones.find((s) => s.id === id);
