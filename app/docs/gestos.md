# Control por gestos

Manejar el cronómetro con la mano, sin tocar el teclado. Para cuando estás en llamada,
escribiendo a mano o lejos de la computadora.

## Las señas

| Seña | Qué hace |
|---|---|
| ☝️ Índice arriba | Tarea 1 |
| ✌️ Dos dedos | Tarea 2 |
| 3️⃣ Tres dedos | Tarea 3 |
| 🖐️ Palma abierta | Pausar |
| 👍 Pulgar arriba | Seguir con lo último |

Se sostiene la seña un momento, de frente a la cámara. Suena distinto según lo que pasó (sube al
arrancar, baja al pausar) y cada acción se puede deshacer desde el aviso que aparece.

**El puño y el pulgar hacia abajo no significan nada, a propósito:** son posturas de reposo o
ambiguas, y como comando darían disparos accidentales.

## Cómo se reconoce (por qué ahora sí es confiable)

Usa el **modelo entrenado de reconocimiento de gestos de MediaPipe** (Google): una red neuronal
entrenada con manos reales que clasifica formas de mano y devuelve su propia confianza.

Esto reemplazó a una versión anterior que **contaba dedos a mano** con geometría y ~68 umbrales
ajustados a ojo. Contar "3 vs 4 dedos vs palma" en una webcam es genuinamente frágil, y por eso
fallaba. El modelo entrenado reconoce formas distintas (Open_Palm, Victory, Pointing_Up, Thumb_Up) de
forma muy sólida. La ÚNICA excepción es "tres dedos": el modelo no tiene esa categoría, así que
se resuelve contando los puntos de la mano que el propio modelo devuelve — un solo gesto por
conteo, no la maraña de antes, y solo cuando el modelo no reconoció una de sus formas. Vale
tanto el 3 con índice+medio+anular como el 3 a la mexicana (pulgar+índice+medio).

## La cámara

- **Apagada por defecto.** Se activa en Ajustes → Integraciones, por persona y por dispositivo.
- **Todo se procesa en el navegador.** El video no se graba, no se guarda y no sale del equipo:
  ni a nuestro servidor ni a ninguno. El modelo se sirve desde nuestro propio dominio, así que
  tampoco hay un tercero enterándose de cuándo lo usas.
- **La preferencia vive solo en ese dispositivo.** No se sincroniza: nadie del equipo, ni un
  admin, puede ver quién lo tiene encendido.
- **Se ve cuando está activa** y se apaga con un clic o sola tras un rato sin manos.

La app promete *"esto es para ti, no para vigilarte"*, y una cámara es justo donde esa promesa se
pone a prueba.

## Practicar / probar

**Ajustes → Integraciones → Practicar sin medir tiempo** (o `/labs/gestos`). No toca el
cronómetro. Muestra en vivo **"Lo que ve el modelo"**: la categoría exacta que reconoce y su
confianza. Es el instrumento honesto: si haces la palma y dice `Open_Palm 0.95`, funciona; si
dice `None 0.3`, ni el modelo entrenado la clava en esa cámara/luz.

## Funciona aunque estés en otra app

El punto de la función: cambiar de tarea mientras estás en Figma, en un PDF o en la llamada, sin
volver a la pestaña. Encendido por defecto, se puede apagar.

Como no ves nada en pantalla, hay dos señales: **el sonido** (te dice que reconoció y ejecutó) y,
**al volver a la app**, un aviso con lo que pasó mientras no mirabas, con opción de deshacerlo.

Detalle técnico: el navegador congela `requestAnimationFrame` y frena los temporizadores de una
pestaña oculta. Lo que NO se frena es el flujo de la cámara, así que el reconocimiento cuelga de
la llegada de cada cuadro (`MediaStreamTrackProcessor`) en vez de un temporizador. Ver
`lib/gestures/metronome.ts` para el camino de respaldo.

## Ajustes finos

- **Qué tanto sostener la seña:** Rápido / Normal / Tranquilo. En videollamadas conviene
  Tranquilo, para que un saludo no mueva el cronómetro.
- **Sonido:** cada acción suena distinto (sube = arrancar/reanudar, baja = pausar, parejo =
  cambiar de tarea). Bajito porque puede sonar en una llamada. Se puede apagar.
- **Una orden a la vez:** tras ejecutar hay que retirar la mano un instante, para que una mano
  ocupada en otra cosa no suelte ráfagas.

## Cómo se enciende para el equipo

La sección aparece en Ajustes → Integraciones para todos, **apagada**; cada quien decide si la
activa. La protección es el opt-in por persona (hubo un flag por variable de entorno y se quitó:
dependía de que la env llegara al build y una compilación cacheada lo dejó apagado en silencio).

## Detalles técnicos

- **MediaPipe GestureRecognizer** (modelo entrenado, ~8.4 MB) en WebAssembly dentro del
  navegador. Se auto-hospeda en `public/mediapipe/` vía `scripts/mediapipe-assets.mjs` (`prebuild`).
- **GPU con caída a CPU** si no hay WebGL (Safari, aceleración desactivada).
- **Rendimiento:** vídeo 320×240, ~12 cuadros/s (7 en segundo plano, 3 sin manos). Bucle sobre
  refs, sin re-render por cuadro (regla 2 de `AGENTS.md`).
- **Una sola pestaña a la vez** (`lib/gestures/camera-lock.ts`).

Capas puras y probadas: `lib/gestures/recognizer.ts` (categoría del modelo → seña),
`lib/gestures/integrator.ts` (sostener → comando), `lib/timer-commands.ts` (comando →
cronómetro), compartida con los atajos de teclado para que la mano y el teclado nunca signifiquen
cosas distintas.
