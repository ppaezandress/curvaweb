import type { CSSProperties } from "react";

// Fondo de un canal. Se guarda en channels.background (jsonb) y lo ve todo el equipo.
export type ChatBackground =
  | { kind: "none" }
  | { kind: "color"; value: string } // hex
  | { kind: "gradient"; value: string } // id de GRADIENTS
  | { kind: "pattern"; value: string; color: string } // id de PATTERNS + color de las líneas
  | { kind: "image"; url: string };

// ── Colores sólidos (paleta de marca + neutrales). El picker también deja elegir libre.
export const SOLID_COLORS: string[] = [
  "#6c47f5", // violeta team tac
  "#4f46e5", // índigo
  "#2f6df0", // azul
  "#0ea5a5", // teal
  "#10b981", // esmeralda
  "#ec4899", // rosa
  "#f59e0b", // ámbar
  "#ef4444", // rojo
  "#334155", // grafito
  "#0f172a", // medianoche
];

// ── Gradientes cósmicos (coherentes con el sistema espacial de la app).
export const GRADIENTS: { id: string; label: string; css: string }[] = [
  { id: "aurora", label: "Aurora", css: "linear-gradient(160deg,#7c5cf7 0%,#2f6df0 100%)" },
  {
    id: "nebulosa",
    label: "Nebulosa",
    css: "radial-gradient(70% 80% at 20% 10%, #8b5cf6, transparent 60%), radial-gradient(60% 70% at 90% 20%, #2f6df0, transparent 62%), linear-gradient(160deg,#1e1b4b,#0c0a1c)",
  },
  { id: "amanecer", label: "Amanecer", css: "linear-gradient(160deg,#ec4899 0%,#f59e0b 100%)" },
  { id: "oceano", label: "Océano", css: "linear-gradient(160deg,#06b6d4 0%,#3b82f6 100%)" },
  { id: "bosque", label: "Bosque", css: "linear-gradient(160deg,#10b981 0%,#0ea5a5 100%)" },
  {
    id: "medianoche",
    label: "Medianoche",
    css: "radial-gradient(60% 60% at 30% 20%, #3730a3, transparent 60%), linear-gradient(160deg,#0f172a,#020617)",
  },
];

// ── Patrones (CSS puro, sin imágenes; se pintan sobre el cosmos global).
export const PATTERNS: { id: string; label: string }[] = [
  { id: "puntos", label: "Puntos" },
  { id: "cuadricula", label: "Cuadrícula" },
  { id: "diagonal", label: "Diagonal" },
  { id: "malla", label: "Malla" },
];

export const DEFAULT_PATTERN_COLOR = "#6c47f5";

const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

function patternStyle(id: string, c: string): CSSProperties {
  switch (id) {
    case "puntos":
      return { backgroundImage: `radial-gradient(${mix(c, 60)} 1.4px, transparent 1.6px)`, backgroundSize: "22px 22px" };
    case "cuadricula":
      return {
        backgroundImage: `linear-gradient(${mix(c, 45)} 1px, transparent 1px), linear-gradient(90deg, ${mix(c, 45)} 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
      };
    case "diagonal":
      return { backgroundImage: `repeating-linear-gradient(45deg, ${mix(c, 40)} 0 2px, transparent 2px 14px)` };
    case "malla":
      return {
        backgroundImage: `radial-gradient(at 18% 20%, ${mix(c, 38)}, transparent 45%), radial-gradient(at 82% 28%, ${mix(c, 30)}, transparent 50%), radial-gradient(at 50% 92%, ${mix(c, 24)}, transparent 55%)`,
      };
    default:
      return {};
  }
}

// Estilo CSS para la capa de fondo del canal.
export function backgroundStyle(bg: ChatBackground): CSSProperties {
  switch (bg.kind) {
    case "color":
      return { background: bg.value };
    case "gradient": {
      const g = GRADIENTS.find((x) => x.id === bg.value);
      return g ? { background: g.css } : {};
    }
    case "pattern":
      return patternStyle(bg.value, bg.color || DEFAULT_PATTERN_COLOR);
    case "image":
      return { backgroundImage: `url(${bg.url})`, backgroundSize: "cover", backgroundPosition: "center" };
    default:
      return {};
  }
}

// Un fondo sólido/gradiente/imagen tapa el cosmos → lleva scrim para legibilidad.
// Un patrón flota sobre el cosmos y ya es sutil → sin scrim.
export function needsScrim(bg: ChatBackground): boolean {
  return bg.kind === "color" || bg.kind === "gradient" || bg.kind === "image";
}

export function hasBackground(bg: ChatBackground | null | undefined): bg is ChatBackground {
  return !!bg && bg.kind !== "none";
}
