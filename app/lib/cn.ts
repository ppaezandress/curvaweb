// Une clases condicionales (mini-clsx, sin dependencia).
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
