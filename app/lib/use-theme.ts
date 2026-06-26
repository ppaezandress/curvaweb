"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "curva.theme";

// Preferencia de tema POR DISPOSITIVO (no por usuario): vive en localStorage y se
// aplica como clase .dark en <html>. El flash inicial lo evita el script inline del
// root layout (app/layout.tsx); este hook mantiene el estado en vivo y reacciona a
// cambios del sistema cuando el modo es "system".
function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  // Hidrata desde localStorage en el cliente.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Theme | null;
      if (saved === "light" || saved === "dark" || saved === "system") setThemeState(saved);
    } catch { /* */ }
  }, []);

  // Si el modo es "system", sigue los cambios del SO en vivo.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(KEY, t); } catch { /* */ }
    applyTheme(t);
  };

  const resolved: "light" | "dark" =
    theme === "dark" || (theme === "system" && systemDark()) ? "dark" : "light";

  return { theme, setTheme, resolved };
}
