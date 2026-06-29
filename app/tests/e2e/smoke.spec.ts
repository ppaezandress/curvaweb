import { test, expect, type Page } from "@playwright/test";

// Credenciales por ENV (nunca hardcodeadas). Usa una cuenta de MIEMBRO de prueba.
const TEAM = process.env.E2E_TEAM || "CURVA";
const EMAIL = process.env.E2E_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || "";

// /reportes es admin-only (redirige a miembros); el e2e corre con cuenta de miembro, así que
// no se incluye aquí (un goto directo a una ruta que redirige aborta en Chromium).
const ROUTES = ["/dashboard", "/tareas", "/mensajes", "/insights", "/momentos", "/rachas", "/recap"];

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
    // .catch: un redirect por rol (ej. miembro en /reportes → /momentos) aborta el goto; es esperado.
    await page.goto(r, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(1800);
    expect(page.url(), `redirigió a login desde ${r}`).not.toContain("/login");
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

// 4) CAMINOS DEL PILOTO — abre los modales/vistas que el equipo va a machacar y verifica
// que no brickean. NO enviamos formularios → cero escrituras a producción.
test("caminos del piloto: modales y vistas clave sin brick", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await login(page);

  // a) Crear tarea (guiado) abre y renderiza el panel
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.getByText("Nueva tarea").first().click();
  await expect(page.locator(".modal-panel")).toBeVisible({ timeout: 8000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // b) Tareas: re-agrupar (Urgencia/Estado/Cliente) sin crash
  await page.goto("/tareas", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  for (const g of ["Urgencia", "Estado", "Cliente"]) {
    await page.getByRole("button", { name: g }).first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // c) Feedback: el botón abre su modal
  await page.getByRole("button", { name: /Dar feedback/i }).click();
  await expect(page.locator(".modal-panel")).toBeVisible({ timeout: 6000 });
  await page.keyboard.press("Escape");

  // d) Mensajes: el composer (textarea) está disponible
  await page.goto("/mensajes", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea", { timeout: 12000 });

  expect(crashes, `Excepciones no atrapadas:\n${crashes.join("\n")}`).toHaveLength(0);
});
