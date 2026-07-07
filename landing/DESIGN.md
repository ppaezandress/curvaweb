# Design

Sistema de diseño de la landing de CURVA. Concepto: **"la curva de transformación"** (de operar por esfuerzo → a crecer con estructura). Paleta **"Cobalto & aire"**: cobalto → azul → cian sobre neutros fríos-claros y tinta marino (no negro). Confiable, tech, luminosa. Fuente de verdad: `src/styles/global.css` (`@theme`).

## Color

OKLCH-adyacente definido en hex dentro de `@theme`. Estrategia: **restrained-to-committed** — neutros fríos claros dominan la superficie, un acento cobalto manda, naranja se reserva para CTAs de alto impacto, violeta SOLO para superficies "IA/Claude".

**Neutros (fríos, gris pizarra) — `--color-sand-*`**
- `50 #f5f8ff` · `100 #eef3fb` · `200 #e2e8f0` · `300 #cbd5e1` · `400 #94a3b8` · `500 #64748b` · `600 #475569` · `700 #334155` · `800 #1e293b` · `900 #0f172a`

**Tinta (fondos oscuros, azul marino)**
- `--color-ink #0f1e3d` · `--color-ink-2 #12213f`

**Acento primario — cobalto** `--color-ember`
- `300 #93c5fd` · base `#2563eb` · `600 #1d4ed8` (nombre histórico "ember" = ahora cobalto)

**Acento-2 — cian** `--color-jade` `#38bdf8` (`300 #7dd3fc`) · confianza `--color-gold #38bdf8`

**Acento potente — naranja** `--color-flare #f97316` (`300 #fdba74` · `600 #ea580c`) — energía, CTAs de alto impacto. Usar con moderación.

**Acento IA — violeta** `--color-ai #7c3aed` (`300 #c4b5fd` · `600 #6d28d9`) + `--gradient-ai`. Exclusivo del composer/hero de IA y "Clases de Claude". No usar como acento general.

**Gradientes firma**
- `--gradient-curve: linear-gradient(110deg, #2563eb, #3b82f6 48%, #38bdf8)`
- `--gradient-curve-soft: #93c5fd → #60a5fa → #7dd3fc`

**Contraste:** cuerpo sobre `sand-50/100` usa `ink`/`sand-700+`; vigilar `sand-500` como texto de cuerpo (roza el mínimo). AA es el piso.

## Typography

Pareo por eje de contraste (geométrica + humanista), no dos sans parecidas.
- **Display:** `Poppins` (`--font-display`), geométrica. Utilidad `.display` con `letter-spacing: -0.022em` (por encima del piso -0.04em; no se aprietan las letras).
- **Texto:** `Inter Variable` (`--font-sans`), humanista.
- Jerarquía: headings en Poppins con pesos altos; cuerpo Inter 400/500. Line-length de prosa acotado. `text-wrap: balance` en títulos.

## Motion

Movimiento como parte del build, no decoración. Curvas de salida exponenciales, sin bounce.
- `--ease-curve: cubic-bezier(0.16, 1, 0.3, 1)` — ease-out fuerte (enter, press, dropdowns).
- `--ease-draw: cubic-bezier(0.65, 0, 0.35, 1)` — trazado de la curva SVG.
- `--ease-pitch: cubic-bezier(0.6, 0, 0.05, 1)` — "snap" tipo Framer/Pitch (movimiento on-screen).
- Duraciones: `--dur-1 160ms` · `--dur-2 320ms` · `--dur-3 600ms` · `--dur-4 900ms`. UI interactiva <300ms; reveals de scroll pueden ser largos.
- **Reglas Emil aplicadas:** press feedback `:active { scale(.97) }` en botones; hovers con `transform` gateados tras `@media (hover: hover) and (pointer: fine)`; dropdowns con `transform-origin` en el origen (no center); nunca `scale(0)`.
- `prefers-reduced-motion: reduce` en toda animación (duraciones a ~0 o crossfade). No opcional.
- Librerías: Lenis (scroll suave), scroll-driven scripts propios (curve-pin, thread, odometer, count, wordfade, climb).

## Components

- **Botones:** `.btn-pop` (lift al hover en punteros finos + press `scale(.97)`), `.btn-ai` (violeta IA), `.btn-shine` (barrido), `.btn-arrow` / `.arrow-cta` (flecha firma que sale y reentra). Pills redondeadas (`rounded-full`), no cards sobre-redondeadas.
- **Nav:** barra con `backdrop-filter`, estado `scrolled` (oscuro→claro), mega-menú desktop con `transform-origin: top center` y entrada `translateY(8px) scale(.98)→1`; menú móvil acordeón (`grid-template-rows` 0fr→1fr).
- **Cards de impacto:** flip-card (hover en desktop, checkbox/tap en touch, focus-within en teclado) — patrón ya accesible.
- **Curva / hilo:** SVG de la curva S como hilo narrativo (Thread, curve-pin, climb, hitos que se encienden).
- **Segmented control / tabs** (`.seg`, `ProcesoTabs`), **carrusel** con dots (`.caso-dot`), **odómetro + sparklines**.

## Layout

- Astro + Tailwind v4 (`@theme`/`@utility`). Flex para 1D, Grid para 2D.
- Fondos: neutros claros dominantes; secciones de tinta marino para contraste y ritmo. Un acento cobalto que manda; naranja puntual.
- Radios contenidos en cards (no 32px+); pill completa solo en tags/botones.
- Responsive real: copy de títulos probado por breakpoint (sin overflow).
