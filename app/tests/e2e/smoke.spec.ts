import { test, expect, type Page } from "@playwright/test";

// Credenciales por ENV (nunca hardcodeadas). Usa una cuenta de MIEMBRO de prueba.
const TEAM = process.env.E2E_TEAM || "CURVA";
const EMAIL = process.env.E2E_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || "";

const ROUTES = ["/dashboard", "/tareas", "/mensajes", "/insights", "/reportes", "/rachas", "/recap"];

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.fill("input[placeholder*='Código']", TEAM);
  await page.fill("input[placeholder*='correo']", EMAIL);
  await page.fill("input[placeholder*='Contraseña']", PASSWORD);
  await page.click("text=Entrar");
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(1000); if (!page.url().includes("/login")) break; }
}

test.beforeEach(() => {
  test.skip(!EMAIL || !PASSWORD, "Define E2E_EMAIL y E2E_PASSWORD (cuenta de miembro de prueba) para correr los smokes.");
});

// 1) AUTH — el login con Supabase aterriza en el dashboard.
test("auth: login aterriza en /dashboard", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});

// 2) RENDER — las 7 rutas cargan el shell autenticado sin CRASH ni quedar fuera de sesión.
// Verificamos: (a) no redirigió a /login, (b) el shell (TopNav) renderizó, (c) cero
// excepciones no atrapadas (pageerror = el crash real; ignoramos ruido benigno de consola).
test("render: las 7 rutas cargan sin crash", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await login(page);
  for (const r of ROUTES) {
    await page.goto(r, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    expect(page.url(), `redirigió fuera de ${r}`).not.toContain("/login");
    await expect(page.getByText("tiempos").first()).toBeVisible({ timeout: 8000 });
  }
  expect(crashes, `Excepciones no atrapadas:\n${crashes.join("\n")}`).toHaveLength(0);
});

// 3) DARK MODE — el tema oscuro aplica la clase .dark sin romper.
test("dark mode: el tema oscuro aplica .dark", async ({ page }) => {
  await login(page);
  await page.evaluate(() => localStorage.setItem("curva.theme", "dark"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  expect(isDark).toBe(true);
});
