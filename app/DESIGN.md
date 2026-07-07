---
name: team tac
description: El estudio ordenado — medir el tiempo y sostener la cultura del equipo de CURVA, con claridad.
colors:
  accent: "#6c47f5"
  accent-dark: "#8b6bf8"
  ink: "#0d0d12"
  fg: "#16161c"
  muted: "#6b6b76"
  surface: "#ffffff"
  surface-2: "#f2f2f6"
  line: "#e7e7ee"
  success: "#0e9e6e"
  warn: "#b5730e"
  danger: "#dc3b41"
  cat-purple: "#6c47f5"
  cat-indigo: "#4f6ef5"
  cat-blue: "#22a7f0"
  cat-teal: "#10b981"
  cat-pink: "#ec4899"
  spotify: "#1db954"
typography:
  display:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  caption:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.005em"
  brand:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.01em"
rounded:
  chip: "6px"
  control: "10px"
  tile: "14px"
  card: "18px"
  hero: "22px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "9999px"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "9999px"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.muted}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
---

# Design System: team tac

## 1. Overview

**El norte: "El Estudio Ordenado."** Un espacio de trabajo pulcro y luminoso donde el equipo de CURVA mide su tiempo y sostiene su cultura. El producto se llama **"team tac"** (tic-tac → el latido del equipo, de donde nace la métrica "Pulso"). La claridad manda: jerarquía nítida, mucho aire, y adorno solo cuando gana la experiencia. Todo sirve al principio rector del producto — **acompañar, no sancionar** — así que el sistema se siente cálido y humano, nunca de vigilancia.

Mood: sereno, luminoso, confiado. La superficie es casi toda neutra y clara; el **acento morado** (`accent`) es el único color de marca/acción y aparece con moderación, como un gesto humano sobre un fondo tranquilo. La marca tiene un serif óptico (Fraunces) reservado para "momentos de marca" (wordmark, saludo, score). El movimiento es discreto y con curvas de salida fuertes; nunca ruidoso.

**No debe sentirse como:** software de vigilancia o control (time-trackers fríos, semáforos de castigo); SaaS corporativo genérico azul/gris de plantilla; ni herramienta sobre-gamificada con insignias y confeti por todos lados. La celebración es sobria y puntual.

Layout: contenedor central `max-w-[1400px]`, columnas con Grid solo cuando hay 2D real (el dashboard es 3 columnas en `lg`), Flexbox para lo demás. Ritmo por espaciado (`space-y-4/5`, `gap-3/5`), no por cajas anidadas. Máximo 5 tamaños de texto en pantalla.

## 2. Colors: La paleta del estudio

**Estrategia: restrained** — neutros luminosos + un acento que ocupa < 10% de la superficie.

- **Acento (marca + acción + dato neutro destacado):** morado `accent` `#6c47f5` (dark: `#8b6bf8`). Regla de oro: **un valor de color no tiene dos nombres.** El acento NO es un color de estado.
- **Neutros semánticos** (cambian con `.dark`): `fg` texto primario `#16161c`, `muted` secundario `#6b6b76` (~5.3:1 sobre blanco, pasa AA), `surface` `#ffffff`, `surface-2` fondos sutiles `#f2f2f6`, `line` bordes `#e7e7ee`, `ink` `#0d0d12` para superficies oscuras de contraste.
- **Semánticos SOLO de estado:** `success` `#0e9e6e`, `warn` `#b5730e`, `danger` `#dc3b41`. Nunca decorativos.
- **Categoría (pilares/áreas, NO acento):** 5 hues distintos por tipo — `cat-purple`, `cat-indigo`, `cat-blue`, `cat-teal`, `cat-pink`. Se usan para diferenciar tipo de tarea, no como decoración.
- **Marca externa:** `spotify` `#1db954` solo para la integración de Spotify.
- **Modo oscuro** por clase `.dark` (manual, no `prefers-color-scheme`): superficies `#18171e`/`#111116`, el acento aclara a `#8b6bf8` y los semánticos suben en luminancia para mantener contraste.

Rampa neutra propia con un tinte violeta muy leve (fija, no cambia con el tema): `neutral-50 #f8f8fb` → `neutral-950 #0d0d12`.

## 3. Typography

Dos familias en contraste real (no dos sans parecidas):

- **Outfit** (`--font-sans` y `--font-display`): geométrica, toda la UI.
- **Fraunces** (`--font-brand`): serif óptico, SOLO momentos de marca (wordmark, saludo del dashboard, score, "Curvi"). Clase `.font-brand`.
- Números tabulares (`.tabular`) en cronómetro, KPIs y score.

Escala tokenizada (máx. 5 tamaños en pantalla):

| Rol | Tamaño | Peso | line-height | tracking |
| --- | --- | --- | --- | --- |
| `display` | 3.5rem (56px) | 600 | 1 | -0.03em |
| `title` | 1.75rem (28px) | 700 | 1.15 | -0.02em |
| `heading` | 1.125rem (18px) | 600 | 1.3 | -0.01em |
| `body` | 0.9375rem (15px) | 400 | 1.5 | — |
| `caption` | 0.8125rem (13px) | 500 | 1.45 | 0.005em |

Piso de legibilidad: el `text-xs`/`text-sm` por defecto de Tailwind se subieron (xs 13px, sm 14.5px) tras feedback del equipo — los textos chicos deben leerse cómodos.

## 4. Elevation

**Plano con capas tonales, no lifted.** La profundidad se logra sobre todo por **capas de superficie** (`surface` sobre `surface-2`) y bordes de 1px (`line`), no por sombras dramáticas. Solo hay dos sombras en todo el sistema:

- `shadow-soft`: reposo de tarjetas y controles — `0 1px 2px / 0 2px 6px -2px` muy sutiles. En dark, un `inset` de 1px hace de borde luminoso.
- `shadow-float`: elementos que sobresalen (dropdowns, modales, popovers) — `0 12px 32px -12px`.

Radios semánticos (regla anti "todo pastilla"; pill solo para avatares, dot en vivo y segmented): `chip 6px`, `control 10px` (inputs/botones), `tile 14px`, `card 18px`, `hero 22px`.

## 5. Components

- **Botón primario:** pill (`rounded-full`), `accent` sólido, texto blanco, `active:scale-95` (feedback de press). El CTA de la app.
- **Botón secundario:** pill, `surface` con borde `line`, texto `fg`; hover sube a borde `accent`. También con press feedback.
- **Card:** `surface`, borde `line`, `rounded-card` (18px), `shadow-soft`. Sin sombras exageradas ni cards anidadas.
- **Input:** `surface`, borde `line`, `rounded-control` (10px), focus con `focus-ring` accesible + borde `accent`. Un solo input en todo el producto (`inputBase`).
- **Chip / badge:** `surface-2`, texto `muted`, `rounded-chip` (6px). Los de estado usan el semántico correspondiente en versión tenue.
- **Modal:** panel centrado (`transform-origin: center`), entra con `modal-pop` (fade + `scale(0.97)→1`, 0.26s), atrapa el foco y devuelve el foco al cerrar.
- **Superficie IA:** carácter propio sereno — fondo de acento muy tenue (`color-mix accent 8%`), sin brillos perpetuos. El trabajo humano usa el acento pleno; la IA, una versión calmada.

Movimiento: curvas de salida fuertes (`--ease-curva` `cubic-bezier(0.16,1,0.3,1)`, `--ease-out` `cubic-bezier(0.23,1,0.32,1)`), duraciones bajo 300ms para UI, stagger `rise` (50–70ms) al entrar. `prefers-reduced-motion` respetado de forma universal.

## 6. Do's and Don'ts

**Do**
- Deja que el neutro domine y el morado sea el gesto: acento < 10% de la superficie.
- Un color, un nombre: si algo es acción/marca es `accent`; si es estado usa `success/warn/danger`.
- Codifica estado con ícono + etiqueta además del color (daltonismo).
- Usa los radios semánticos según el tamaño del elemento; pill solo para avatares, dot en vivo y segmented.
- Anima `transform`/`opacity` con las curvas de salida fuertes; bajo 300ms para UI; press feedback (`active:scale`) en lo presionable.
- Detalle denso a `/insights`; el dashboard muestra lo esencial de un vistazo.

**Don't**
- No uses los colores de categoría (5 hues) como decoración ni el acento como color de estado.
- No hagas "todo pastilla": nada de `rounded-full` en tarjetas o inputs.
- No apiles cards dentro de cards ni pongas sombras dramáticas; la profundidad es tonal.
- No animes propiedades de layout (`left`, `width`, `height`); usa `transform`.
- No inventes métricas: si la data es de prueba o falla la conexión, avísalo.
- No conviertas la celebración en ruido permanente (confeti/insignias por todos lados).
