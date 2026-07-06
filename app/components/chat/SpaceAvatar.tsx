"use client";

import { Globe } from "lucide-react";

// Identidad propia de los "Espacios" (en vez del "#" de Slack): el espacio del equipo
// es un orbe con gradiente de CURVA; los demás son cuadros de color con su inicial,
// con color estable derivado del nombre. Los Directos usan el avatar de la persona.
const SPACE_COLORS = ["var(--color-curva-teal)", "var(--color-curva-blue)", "var(--color-curva-purple)", "var(--color-curva-indigo)", "var(--color-curva-pink)"];

function colorFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SPACE_COLORS[h % SPACE_COLORS.length];
}

export function SpaceAvatar({ name, kind, size = 28 }: { name: string; kind: string; size?: number }) {
  const radius = Math.round(size * 0.32);
  if (kind === "team") {
    return (
      <span className="curva-gradient inline-flex shrink-0 items-center justify-center text-white" style={{ width: size, height: size, borderRadius: radius }}>
        <Globe size={Math.round(size * 0.55)} />
      </span>
    );
  }
  const color = colorFor(name || "?");
  const initial = (name || "?").trim()[0]?.toUpperCase() || "•";
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-bold"
      style={{ width: size, height: size, borderRadius: radius, background: `${color}22`, color, fontSize: Math.round(size * 0.45) }}
    >
      {initial}
    </span>
  );
}
