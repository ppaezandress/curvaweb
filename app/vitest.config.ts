import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pruebas unitarias de la LÓGICA PURA (cálculo de tiempos, analítica del día, pulso,
// filtros de fecha, saneo de logs). No montan React ni pegan a la red: corren en ~1s y
// pueden vivir en CI. Los flujos de navegador siguen en tests/e2e con Playwright.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Las e2e las corre Playwright, no Vitest.
    exclude: ["tests/e2e/**", "node_modules/**"],
    // Zona horaria fija: media app depende de fechas locales (México). Sin esto, un runner
    // en UTC "pasaría" pruebas que en las máquinas del equipo fallan — justo el bug del due
    // date que ya nos mordió una vez.
    env: { TZ: "America/Mexico_City" },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
