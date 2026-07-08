import type { CSSProperties } from "react";

// Fondo de un canal. Se guarda en channels.background (jsonb) y lo ve todo el equipo.
// `intensity` (0.35–1) modula cuánto pesa el fondo sobre el cosmos/contenido; default 1.
export type ChatBackground =
  | { kind: "none" }
  | { kind: "color"; value: string; intensity?: number }
  | { kind: "gradient"; value: string; intensity?: number }
  | { kind: "pattern"; value: string; color: string; intensity?: number }
  | { kind: "image"; url: string; intensity?: number };

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
  "#64748b", // pizarra
  "#334155", // grafito
  "#0f172a", // medianoche
  "#faf5ff", // niebla (casi blanco lila)
];

// ── Gradientes cósmicos curados (coherentes con el sistema espacial de la app).
export const GRADIENTS: { id: string; label: string; css: string }[] = [
  { id: "aurora", label: "Aurora", css: "linear-gradient(155deg,#7c5cf7 0%,#4f46e5 48%,#2f6df0 100%)" },
  {
    id: "nebulosa",
    label: "Nebulosa",
    css: "radial-gradient(80% 90% at 18% 8%, #8b5cf6, transparent 58%), radial-gradient(70% 80% at 92% 22%, #2f6df0, transparent 60%), radial-gradient(90% 90% at 60% 108%, #db2777, transparent 62%), linear-gradient(160deg,#241b52,#0c0a1c)",
  },
  { id: "crepusculo", label: "Crepúsculo", css: "linear-gradient(150deg,#6d28d9 0%,#db2777 55%,#f59e0b 100%)" },
  { id: "amanecer", label: "Amanecer", css: "linear-gradient(160deg,#f472b6 0%,#fb923c 55%,#fbbf24 100%)" },
  { id: "oceano", label: "Océano", css: "linear-gradient(160deg,#0ea5e9 0%,#2f6df0 55%,#4338ca 100%)" },
  { id: "boreal", label: "Boreal", css: "linear-gradient(150deg,#059669 0%,#0ea5a5 50%,#6366f1 100%)" },
  { id: "bosque", label: "Bosque", css: "linear-gradient(160deg,#10b981 0%,#0d9488 100%)" },
  {
    id: "medianoche",
    label: "Medianoche",
    css: "radial-gradient(70% 70% at 28% 18%, #3730a3, transparent 58%), radial-gradient(60% 60% at 85% 80%, #1e3a8a, transparent 60%), linear-gradient(160deg,#0f172a,#020617)",
  },
];

// ── Patrones (CSS puro, sin imágenes; se pintan sobre el cosmos global).
export const PATTERNS: { id: string; label: string }[] = [
  { id: "puntos", label: "Puntos" },
  { id: "cuadricula", label: "Cuadrícula" },
  { id: "diagonal", label: "Diagonal" },
  { id: "malla", label: "Malla" },
  { id: "ondas", label: "Ondas" },
];

export const DEFAULT_PATTERN_COLOR = "#6c47f5";
export const DEFAULT_INTENSITY = 1;

const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

function patternStyle(id: string, c: string): CSSProperties {
  switch (id) {
    case "puntos":
      return { backgroundImage: `radial-gradient(${mix(c, 60)} 1.4px, transparent 1.6px)`, backgroundSize: "22px 22px" };
    case "cuadricula":
      return {
        backgroundImage: `linear-gradient(${mix(c, 42)} 1px, transparent 1px), linear-gradient(90deg, ${mix(c, 42)} 1px, transparent 1px)`,
        backgroundSize: "30px 30px",
      };
    case "diagonal":
      return { backgroundImage: `repeating-linear-gradient(45deg, ${mix(c, 38)} 0 2px, transparent 2px 15px)` };
    case "malla":
      return {
        backgroundImage: `radial-gradient(at 18% 20%, ${mix(c, 40)}, transparent 45%), radial-gradient(at 82% 28%, ${mix(c, 32)}, transparent 50%), radial-gradient(at 50% 92%, ${mix(c, 26)}, transparent 55%)`,
      };
    case "ondas":
      return {
        backgroundImage: `radial-gradient(circle at 50% 120%, transparent 34%, ${mix(c, 34)} 35%, ${mix(c, 34)} 36%, transparent 37%)`,
        backgroundSize: "38px 20px",
      };
    default:
      return {};
  }
}

// Estilo CSS de la CAPA de fondo (sin scrim ni opacidad; eso lo aplica el componente).
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

// Scrim inteligente: velo del color de tema en gradiente vertical — más denso abajo
// (composer + mensajes recientes) y ligero arriba, para que respire sin perder lectura.
// Theme-aware vía var(--background). Se atenúa con la intensidad del fondo.
export function scrimStyle(bg: ChatBackground): CSSProperties {
  const k = 0.6 + 0.4 * intensityOf(bg); // fondos intensos piden un poco más de velo
  return {
    background: `linear-gradient(to top, color-mix(in srgb, var(--background) ${Math.round(64 * k)}%, transparent) 0%, color-mix(in srgb, var(--background) ${Math.round(34 * k)}%, transparent) 52%, color-mix(in srgb, var(--background) ${Math.round(22 * k)}%, transparent) 100%)`,
  };
}

export function intensityOf(bg: ChatBackground): number {
  if (bg.kind === "none") return DEFAULT_INTENSITY;
  return typeof bg.intensity === "number" ? Math.min(1, Math.max(0.35, bg.intensity)) : DEFAULT_INTENSITY;
}

// Devuelve una copia del fondo con nueva intensidad (para el slider del picker).
export function withIntensity(bg: ChatBackground, intensity: number): ChatBackground {
  if (bg.kind === "none") return bg;
  return { ...bg, intensity };
}

export function hasBackground(bg: ChatBackground | null | undefined): bg is ChatBackground {
  return !!bg && bg.kind !== "none";
}

// Clave estable para animar el crossfade solo cuando cambia el fondo (no la intensidad).
export function backgroundKey(bg: ChatBackground | null | undefined): string {
  if (!bg || bg.kind === "none") return "none";
  if (bg.kind === "color") return `color:${bg.value}`;
  if (bg.kind === "gradient") return `gradient:${bg.value}`;
  if (bg.kind === "pattern") return `pattern:${bg.value}:${bg.color}`;
  return `image:${bg.url}`;
}
