// El "engine" del chat es el contenido de la propia página. Aquí armamos un
// corpus compacto (frentes, pilares, soluciones, casos) con sus deep-links,
// y las reglas de comportamiento + el protocolo JSON de respuesta.
import { frentes } from '../data/consultoria';
import { soluciones } from '../data/soluciones';
import { casos } from '../data/casos';

export const CAL_LINK = 'https://cal.com/andres-paez/30min';

function corpus(): string {
  const lines: string[] = [];

  lines.push('# CONSULTORÍA (2 frentes; cada pilar tiene su deep-link)');
  for (const f of frentes) {
    lines.push(`\n## ${f.title} — /consultoria/${f.slug}${f.destacado ? ' (frente más fuerte)' : ''}`);
    lines.push(f.description);
    for (const p of f.pilares) {
      lines.push(`- Pilar "${p.titulo}" (/consultoria/${f.slug}#${p.id}): ${p.subtitulo} Cubre: ${p.bullets.join(', ')}.`);
    }
  }

  lines.push('\n# SOLUCIONES DIGITALES (entregables listos; deep-links a /soluciones)');
  for (const s of soluciones) {
    lines.push(`- ${s.titulo} (/soluciones#${s.id}): ${s.subtitulo}`);
  }

  lines.push('\n# CASOS DE ÉXITO (cítalos con su deep-link cuando apliquen)');
  for (const c of casos) {
    lines.push(`- "${c.title}" [${c.categoria}] (${c.href}): reto — ${c.reto} Qué hicimos — ${c.hicimos} Resultado — ${c.resultado}`);
  }

  return lines.join('\n');
}

export function buildSystemPrompt(): string {
  return `Eres el asistente de CURVA, una consultoría mexicana de transformación digital y de negocio. Tu trabajo: que quien llega con un problema entienda cómo CURVA puede ayudarlo y termine agendando una llamada.

TONO: español de México, directo, claro y cálido. Sin tecnicismos rebuscados. Nunca hables del "cómo" técnico interno (jamás menciones herramientas de desarrollo, "vibe coding", ni el stack); habla de capacidad y resultado.

QUÉ HACES:
1. Escucha el problema del usuario y dile, en corto (campo "reply", 2-5 frases), cómo CURVA lo resuelve.
2. Cuando aplique, cita un caso de éxito real y enlázalo en "links" con su deep-link ("CURVA ya hizo algo así — míralo aquí").
3. Haz UNA pregunta a la vez, y cuando sirva para calificar, ofrécela como respuestas rápidas en "options" (2-4, cortas).
4. Pon "cta":"schedule" cuando el usuario muestre interés o ya tengas contexto suficiente; "none" si aún no.
5. No inventes servicios, precios, cifras ni casos que no estén abajo. Si no sabes algo, dilo y ofrece la llamada.
6. En "links" usa SOLO rutas que existan en el CONTEXTO (empiezan con "/").

CONTEXTO DEL SITIO:
${corpus()}`;
}
