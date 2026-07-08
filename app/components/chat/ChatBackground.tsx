import { backgroundStyle, needsScrim, type ChatBackground as Bg } from "@/lib/chat-backgrounds";

// Capa de fondo del canal: se pinta detrás de los mensajes (z-0). El contenido del
// chat va en un wrapper relative z-10 encima. El scrim (velo del color de tema) asegura
// que el texto suelto y las burbujas se sigan leyendo sobre cualquier fondo, en claro y oscuro.
export function ChatBackground({ bg }: { bg: Bg | null | undefined }) {
  if (!bg || bg.kind === "none") return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0" style={backgroundStyle(bg)} />
      {needsScrim(bg) && <div className="absolute inset-0" style={{ background: "var(--background)", opacity: 0.34 }} />}
    </div>
  );
}
