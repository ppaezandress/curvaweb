import { defineConfig } from "@playwright/test";

// Smokes e2e de camino crítico. Reusa el dev server si ya corre (o lo levanta).
// Correr con credenciales de una cuenta de MIEMBRO de prueba (no se hardcodean):
//   E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    actionTimeout: 15_000,
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
