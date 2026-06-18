// Categoriza el foco actual (app + título de ventana) para dar contexto.
// Transparente, sin vigilancia: solo muestra dónde estás, no espía contenido.

export type FocusTone = "work" | "distraction" | "neutral";

const DISTRACTION_APPS = [
  "Netflix",
  "TikTok",
  "Disney",
  "Twitch",
  "Steam",
  "Prime Video",
  "HBO",
];

const WORK_APPS = [
  "Notion",
  "Code",
  "Visual Studio Code",
  "Cursor",
  "Figma",
  "Microsoft Excel",
  "Microsoft Word",
  "Microsoft PowerPoint",
  "Numbers",
  "Pages",
  "Keynote",
  "Terminal",
  "iTerm",
  "Slack",
  "Mail",
  "Preview",
  "Linear",
];

// Palabras clave que aparecen en el TÍTULO de la ventana (sirve para pestañas
// del navegador: "… - YouTube", "… - Notion", etc.).
const DISTRACTION_SITES: Record<string, string> = {
  youtube: "YouTube",
  netflix: "Netflix",
  tiktok: "TikTok",
  twitch: "Twitch",
  instagram: "Instagram",
  facebook: "Facebook",
  reddit: "Reddit",
  "disney+": "Disney+",
  "prime video": "Prime Video",
  twitter: "X / Twitter",
  " x ": "X / Twitter",
};

const WORK_SITES: Record<string, string> = {
  notion: "Notion",
  "google docs": "Google Docs",
  "google sheets": "Google Sheets",
  "google slides": "Google Slides",
  figma: "Figma",
  github: "GitHub",
  gitlab: "GitLab",
  linear: "Linear",
  gmail: "Gmail",
  "stack overflow": "Stack Overflow",
  vercel: "Vercel",
  jira: "Jira",
  confluence: "Confluence",
  canva: "Canva",
};

function matchSite(
  title: string,
  table: Record<string, string>,
): string | null {
  for (const key of Object.keys(table)) {
    if (title.includes(key)) return table[key];
  }
  return null;
}

/**
 * @param app   nombre de la app en foco (p. ej. "Atlas", "Notion")
 * @param title título de la ventana (p. ej. "Mi video - YouTube") — opcional
 */
export function categorizeFocus(
  app: string,
  title: string,
): { label: string; tone: FocusTone } {
  const a = (app || "").trim();
  const t = (title || "").toLowerCase();

  // 1) Distracción por nombre de app (Netflix de escritorio, etc.)
  if (DISTRACTION_APPS.some((d) => a.includes(d)))
    return { label: a || "—", tone: "distraction" };

  // 2) Por el título de la ventana (cubre pestañas del navegador).
  const distSite = matchSite(t, DISTRACTION_SITES);
  if (distSite) return { label: `${a} · ${distSite}`, tone: "distraction" };
  const workSite = matchSite(t, WORK_SITES);
  if (workSite) return { label: `${a} · ${workSite}`, tone: "work" };

  // 3) Por nombre de app de trabajo.
  if (WORK_APPS.some((w) => a.includes(w)))
    return { label: a, tone: "work" };

  // 4) Neutral: muestra el título recortado si lo tenemos.
  const shortTitle = title.trim().slice(0, 32);
  return {
    label: shortTitle ? `${a} · ${shortTitle}` : a || "—",
    tone: "neutral",
  };
}
