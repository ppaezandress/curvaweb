# CURVA — Marca y sistema de diseño

> El norte de la identidad. Todo lo visual de la app sirve a esto. Si algo no cabe aquí, no entra.

## 1. Concepto rector: **la curva**

El tiempo **no es una lista ni una cuadrícula**. Todos los competidores (Toggl, Harvest, Clockify, los calendarios) son barras, grids y tablas — frío, rectangular, de hoja de cálculo. CURVA rompe ese paradigma: **el tiempo es una curva.**

- Tu **día** es una curva (la energía que sube y baja).
- Tu **semana** es una curva.
- Tu **momentum** es un arco.
- Tu **curva de aprendizaje** es, literal, el north star hecho visual: aprender de cómo trabajas = doblar tu propia curva.

**Firma visual:** el arco / la curva como **forma recurrente** — anillos, arcos, líneas que fluyen — en lugar de rectángulos duros y barras. Donde un competidor pondría una barra, nosotros ponemos un arco.

## 2. Color

| Rol | Token | Valor | Significado |
|---|---|---|---|
| Acento primario | `accent` | violeta `#7c3aed` | energía humana · trabajo a mano |
| Acento secundario | `accent-2` | teal `#10b981` | logro · vivo · co-working |
| IA | `curva-indigo` | índigo `#6366f1` | el lenguaje propio de la IA |
| Éxito | `success` | teal | |
| Atención | `warn` | ámbar `#f59e0b` | |
| Peligro | `danger` | rosa-rojo `#f43f5e` | |

**Gradiente firma (`curva-gradient`):** violeta→índigo→azul→teal→rosa. Se usa **con intención** (cultura, logro, energía, Curvi), **nunca de relleno**. Tokens: `--curve-from / --curve-via / --curve-to`.

**Neutros (theme-aware, claro+oscuro):** `bg` (fondo de página), `surface` (tarjetas), `surface-2` (fondos sutiles), `fg` (texto primario), `muted` (texto secundario), `line` (bordes). `ink` queda fijo para píldoras oscuras y scrims.

## 3. Tipografía

- **Display — Fraunces** (serif óptico suave, variable): da calidez y distinción. Solo para momentos grandes: wordmark, nombre "Curvi", números hero (reloj, momentum), títulos de sección importantes. Clase `.font-brand`.
- **UI / Body — Outfit** (geométrica limpia): todo lo demás. Números siempre `.tabular` (no "bailan").
- Regla: el serif es el **acento**, no la norma. Sobriedad primero.

## 4. Movimiento (firma)

- Las cosas **fluyen, no brincan.** Curva de ease estándar `--ease-curve: cubic-bezier(0.16, 1, 0.3, 1)`.
- **Curvi respira:** su presencia es un arco que late suave (`.breathe`), no un avatar de robot.
- Calmado, nunca nervioso (refuerza "no estorba"). Duraciones: `--dur-fast 160ms · --dur-base 280ms · --dur-slow 520ms`.
- **Todo el motion respeta `prefers-reduced-motion`** (fallback estático).

## 5. Curvi — el personaje

Curvi es la cara del producto. Su **voz** importa tanto como su forma.

- **Forma:** un arco/curva vivo que respira. No un "robot IA".
- **De qué lado está:** del **tuyo**. Tu data es tuya. Es un colega que te conoce, no un jefe que te vigila.
- **Tono:** cálido, plano, español de México natural. Concreto. Nunca relleno.

**Curvi SÍ:**
- Propone un plan concreto: *"Tienes 3 cosas pesadas hoy. Arranca con la propuesta de Wellness mientras estás fresco — te suele tomar ~2h."*
- Explica el porqué: *"La pongo primero porque lo pesado te sale mejor antes de mediodía."*
- Reconoce sin exagerar: *"Llevas 4 días cerrando lo que te propones. Va bien."*

**Curvi NUNCA:**
- Regaña ni culpa (~~"Llevas 2 días sin registrar nada"~~).
- Suena corporativo/motivacional vacío (~~"¡Sigamos maximizando tu productividad! 🚀"~~).
- Usa clichés de IA (~~"Como modelo de lenguaje…"~~, ~~"¡Excelente pregunta!"~~).
- Presume data cruda de otras personas (respeta el muro: equipo = solo agregados).

**Regla de copy (toda la UI):** si una frase suena a software gringo traducido o a LinkedIn, **reescríbela**. Plano y humano.

## 6. Tokens (referencia técnica)

Definidos en `app/globals.css`. Cero colores hardcodeados en componentes — todo por token.

- **Color semántico:** `bg`, `surface`, `surface-2`, `fg`, `muted`, `line`, `accent`, `accent-2`, `success`, `warn`, `danger`.
- **La curva:** `--curve-from`, `--curve-via`, `--curve-to` + clase `.curva-gradient` / `.curva-gradient-text`.
- **Movimiento:** `--ease-curve`, `--dur-fast/base/slow`; animaciones `.breathe`, `.rise`, `.flow-in`.
- **Tipografía:** `--font-sans` (Outfit), `--font-brand` (Fraunces) + clase `.font-brand`.
- **Radios:** generosos y curvos (escala Tailwind `rounded-xl/2xl/3xl`).

## 7. Gate de calidad
Cada pantalla pasa por **web-design-reviewer** + **webapp-testing** (Playwright) en **claro y oscuro**. Se corrige contraste, layout y responsive antes de cerrar.
