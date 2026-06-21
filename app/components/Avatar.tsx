import type { Member } from "@/lib/mock-data";
import { initials as toInitials } from "@/lib/format";

/**
 * Avatar unificado del producto.
 * - Si hay `src` (foto de perfil de Supabase), muestra la foto.
 * - Si no, muestra iniciales sobre el color de marca de la persona.
 * Acepta `member` (datos de Notion) o `name`+`color` sueltos (chat/presencia).
 */
export function Avatar({
  member,
  name,
  color,
  src,
  size = 36,
}: {
  member?: Member;
  name?: string;
  color?: string;
  src?: string | null;
  size?: number;
}) {
  const label = member?.name ?? name ?? "?";
  const bg = member?.color ?? color ?? "var(--color-curva-purple)";
  const short = member?.short ?? toInitials(label);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        title={label}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white"
      style={{ background: bg, width: size, height: size, fontSize: size * 0.4 }}
      title={label}
      aria-hidden
    >
      {short}
    </span>
  );
}
