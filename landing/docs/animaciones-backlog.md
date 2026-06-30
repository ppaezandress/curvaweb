# Backlog de animaciones — CURVA landing

Ideas de motion **propuestas y parqueadas** (no implementadas todavía), guardadas para
retomarlas. Salen de la dirección de arte del rediseño v10x. Regla de oro de marca:
**la curva es la protagonista; cada animación o la sirve o se va.** Todo lo de aquí debe
respetar `prefers-reduced-motion` y no dañar el LCP.

Tokens/infra que ya existe y conviene reusar (en `src/styles/global.css` + `src/scripts/`):
eases `--ease-pitch` / `--ease-curve` / `--ease-draw`; gradiente firma `--gradient-curve`
(morado→índigo→azul); `data-curve-draw="scroll"` + `curve-draw.ts` (traza paths con
stroke-dashoffset al hacer scroll); `.curve-dot` con `offset-path`; `.reveal`/`.lift`/
`.btn-pop`/`.parallax`/`data-count`/`data-magnetic`/`.word-before`/`.word-after`.

> Estado v10x (YA implementado, NO en este backlog): A1 hilo continuo (Thread), A2 pin
> scrollytelling de #la-curva, A3 tipografía-tesis (.word-before/after), A4 odómetro +
> sparklines que se trazan.

---

## 1. Cinta con velocidad ligada al scroll (scroll-velocity marquee) — ⭐ alto valor / bajo riesgo
**Hoy:** la cinta de capacidades corre a velocidad constante (2 filas opuestas).
**Idea:** que **acelere con la velocidad de scroll** y se incline levemente (skew) según la
dirección — sensación de "máquina que responde". Firma de Framer/GSAP.
**Cómo:** scroll-handler con rAF que mide `deltaScroll`; sumar ese delta a la posición X del
`.marquee-track` y aplicar `skewX` proporcional a la velocidad; decae a la velocidad base.
**Dónde:** sección CINTA en `index.astro` (el `.marquee-track`). **reduced-motion:** estático.

## 2. Problema: reveal por máscara que "subraya/tacha" — ⭐ on-brand
**Hoy:** los 4 dolores aparecen con fade-up genérico (`reveal reveal-d*`).
**Idea:** cada dolor entra como si una línea de curva lo **subrayara/tachara** de izq→der.
**Cómo:** CSS scroll-driven puro con `animation-timeline: view()` por `<li>`: un pseudo-elemento
`::after` (línea con `--gradient-curve`) que anima `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`.
**Dónde:** `#problema` lista en `index.astro`. **reduced-motion:** línea visible al 100%.

## 3. Problema: medidor "nivel de caos" en la columna sticky
**Hoy:** la columna izquierda sticky no hace nada mientras está pegada (momento de scroll desperdiciado).
**Idea:** una mini-curva **plana y errática** (el "antes") que se dibuja al lado mientras la columna
está pinned — anticipa el contraste con la curva ascendente de la sección "La Curva".
**Cómo:** SVG con `data-curve-draw="scroll"` (reusa `curve-draw.ts`) y un path quebrado/ruidoso.
**Dónde:** columna sticky de `#problema`. **reduced-motion:** dibujada estática.

## 4. Servicios: borde que se "dibuja" en hover — ⭐ on-brand
**Hoy:** las cards usan `data-tilt` + `hover:shadow-2xl` (genérico SaaS).
**Idea:** que el **borde de la card se trace** (curva-stroke recorriendo el perímetro) en el color
del acento al hacer hover — refuerza "todo en CURVA se dibuja".
**Cómo:** SVG `<rect>` (o path) de borde con `pathLength="1"`; en hover transicionar
`stroke-dashoffset: 1 → 0`. CSS puro. **Dónde:** cards de `#servicios`. **reduced-motion:** borde fijo.

## 5. Servicios: conector vivo entre las 2 cards
**Idea:** una línea-curva sutil que **enlaza** Consultoría ↔ Digitalización al hacer scroll,
reforzando el copy "no van por separado". **Cómo:** SVG absoluto entre las cards + `data-curve-draw`
+ view-timeline. **reduced-motion:** visible estática.

## 6. ProcesoTabs: el punto VIAJA entre pasos — ⭐ coherencia con el pin
**Hoy:** la mini-curva del panel salta al nuevo `stroke-dashoffset` al cambiar de tab.
**Idea:** al cambiar de tab, un punto viajero **recorre** de paso N → N+1 sobre la curva
(`transition` de `offset-distance`), igual que el punto de la escena grande (coherencia).
**Cómo:** añadir un `.curve-dot` al SVG del panel en `ProcesoTabs.astro`; en `tabs.ts`, al activar,
setear `offset-distance` con transición. **reduced-motion:** salto directo.

## 7. Producto: mockup "vivo" — ⭐ (interino hasta tener captura real)
**Hoy:** el mockup placeholder de Curva Tiempos es estático.
**Idea:** al entrar en viewport, las **barras se llenan** y la curva interna **se dibuja** — el
producto se ve "funcionando".
**Cómo:** IntersectionObserver o view-timeline: animar `width`/`scaleX` de las barras + `data-curve-draw`
en la curva interna. **Dónde:** mockup en sección PRODUCTO. Se retira cuando exista captura real
(`producto.shot`). **reduced-motion:** estado lleno directo.

## 8. Producto: parallax por capas con el SCROLL
**Hoy:** el `.stack` mueve solo la capa frontal con el CURSOR (`data-parallax`).
**Idea:** las 3 capas (`l1/l2/front`) se mueven a **distinta profundidad con el scroll** (no solo cursor).
**Cómo:** scroll-handler que aplica translateY distinto por capa según progreso. **reduced-motion:** sin movimiento.

## 9. Transición de sección por barrido de gradiente morado→azul — ⭐⭐ (selectivo, no en todas)
**Idea:** SOLO en 2-3 transiciones narrativamente clave (Problema→La Curva, La Curva→Servicios), una
**banda-curva** que barre de `#7c3aed`→`#2563eb` ligada al scroll — el barrido ES el viaje de
morado (esfuerzo) → azul (sistema). **NO en todas** (sería mareante / "AI slop").
**Cómo:** una banda SVG/div entre secciones con `background-position` o `clip-path` ligado a view-timeline.
**reduced-motion:** banda estática con el gradiente final.

## 10. Cercanía / lead magnet: checklist que se "palomea" en secuencia
**Idea:** los ítems del checklist se marcan ✓ uno por uno al entrar en viewport (refuerza "se hace solo").
**Cómo:** stagger de un check SVG (`stroke-dashoffset`) por ítem vía view-timeline o IO.
**Dónde:** `components/LeadMagnet.astro`. **reduced-motion:** todos marcados directo.

## 11. Cursor que deforma la curva (experimental, riesgo medio)
**Idea:** en la escena de "La Curva" (desktop), el cursor cercano **deforma** levemente el path
(los puntos de control se atraen al mouse). Muy "wow" pero delicado.
**Cómo:** recalcular el `d` del path en mousemove con desplazamiento de puntos de control (rAF, solo
`pointer:fine`). **reduced-motion / touch:** desactivado. Evaluar costo/beneficio antes de invertir.

---

### Prioridad sugerida si se retoma (impacto × bajo riesgo × on-brand)
1. **#1 cinta scroll-velocity** y **#6 punto que viaja en ProcesoTabs** (refuerzan coherencia, bajo riesgo).
2. **#4 borde que se dibuja en Servicios** y **#2 tachado en Problema** (CSS puro, on-brand).
3. **#9 barrido de gradiente** (selectivo) y **#7 mockup vivo** (mayor impacto, riesgo medio).
4. **#11 cursor deforma curva** solo si sobra tiempo (experimental).

### Pendiente de contenido (no es motion, pero condiciona algunas ideas)
Cifras reales de la banda, testimonios, captura+URL de Curva Tiempos (habilita #7 final), webhook del
lead magnet, dominio real.

---

## Estilos/animaciones YA DEFINIDOS pero sin usar (listos para enganchar)
Esto ya vive en el código; solo falta ponerle la clase a un elemento. **No borrar** — se conservan a
propósito (decisión del usuario: guardar el estilo de animaciones que no usamos para después).

### `node-pulse` — anillo "ping" que se expande
`src/styles/global.css` (`.node-pulse` + `.node-pulse::before` + `@keyframes ping`). Un anillo que
late hacia afuera (`scale` + fade) en bucle, en `currentColor`. **Uso:** añadir `class="node-pulse"`
a un elemento HTML (pill/icono) para que pulse — pensado para un hito al "encenderse" o un badge de
estado ("en vivo"). Nota: es para cajas HTML; para pulsar un nodo SVG hace falta animación SVG aparte.
Idea original: pulso en los hitos de la escena de la curva al iluminarse.

### `curve-text-soft` (+ `--gradient-curve-soft`) — texto con gradiente claro
`src/styles/global.css` (`@utility curve-text-soft`, consume `--gradient-curve-soft`: morado→índigo→azul
claros). Variante suave de `curve-text`. **Uso:** `class="curve-text-soft"` en un `<span>` para un acento
de gradiente más tenue (sobre fondos oscuros). Útil si se quiere un tercer nivel de énfasis sin abusar
del `curve-text-live` (animado, hoy limitado a 2 lugares).

### `curve-scene.ts` — encender hitos por scroll (escena NO fijada)
`src/scripts/curve-scene.ts` (marcado ⏸️ PARQUEADO, ya no se importa). Conduce `.milestone[data-at]`
(toggle `.lit/.pending`) según el progreso de scroll del trazo, SIN pin. Lo reemplazó `curve-pin.ts`
para `#la-curva`. **Reactivar:** re-importar en `BaseLayout`, llamar `initCurveScene()`, y que la escena
use un `[data-curve-draw="scroll"]` dentro de `#la-curva`. Útil si algún día se quiere la versión
ligera (sin fijar la sección) o una segunda escena de curva en otra página.
