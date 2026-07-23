# Control por gestos

Manejar el cronómetro con la mano, sin tocar el teclado. Para cuando estás en llamada,
escribiendo a mano o lejos de la computadora.

## Las señas

| Seña | Qué hace |
|---|---|
| 1 a 4 dedos | Cambia a esa tarea del dock |
| 🖐️ Palma abierta | Pausa lo que esté corriendo |
| ✊ Puño | Sigue con lo último que medías |

Mano abierta suelta el trabajo, mano cerrada lo vuelve a agarrar. Los dedos, en medio, eligen.

**Cuenta cuántos dedos levantas, no cuáles.** Da igual si el 3 lo haces con pulgar+índice+medio
(como se cuenta en México) o con índice+medio+anular. Las dos formas valen — la primera versión
solo aceptaba una y falló con el primer usuario real.

Hay que **sostener la seña** (~1 segundo, configurable). Suena un tic cuando te reconoce y un
tono al ejecutar, y cada acción se puede deshacer desde el aviso que aparece.

## La cámara

- **Apagada por defecto.** Se activa en Ajustes → Integraciones, por persona y por dispositivo.
- **Todo se procesa en el navegador.** El video no se graba, no se guarda y no sale del equipo:
  ni a nuestro servidor ni a ninguno. El modelo de reconocimiento se sirve desde nuestro propio
  dominio, así que tampoco hay un tercero enterándose de cuándo lo usas.
- **La preferencia vive solo en ese dispositivo.** No se sincroniza: nadie del equipo, ni un
  admin, puede ver quién lo tiene encendido.
- **Se ve cuando está activa**: hay un indicador permanente mientras la cámara corre, y se
  apaga con un clic o sola tras 5 minutos sin manos.

Esto no es un detalle legal: la app promete *"esto es para ti, no para vigilarte"*, y una
cámara es justo donde esa promesa se pone a prueba.

## Practicar

**Ajustes → Integraciones → Practicar sin medir tiempo** (o `/labs/gestos`). Esa pantalla mide
cuántas veces atina cada seña y **no toca el cronómetro**: se puede usar todo lo que uno quiera
sin ensuciar el historial.

## Ajustes finos

**Qué tanto sostener la seña:** Rápido (0.8 s) · Normal (1.2 s) · Tranquilo (2 s). Si pasas el
día en videollamadas, ponlo en Tranquilo — así un saludo no te mueve el cronómetro.

**Sonido:** se puede apagar. Va bajito a propósito porque puede sonar en una llamada.

## Cómo se enciende para el equipo

Está detrás de la variable `NEXT_PUBLIC_GESTURES`. Con `=1` en Vercel, la sección aparece en
Ajustes para todos — **apagada**, cada quien decide si la activa. Sin la variable, la función
no existe para nadie.

## Detalles técnicos

- **MediaPipe Hand Landmarker** (Google) corriendo en WebAssembly dentro del navegador. El
  modelo (7.5 MB) y el runtime se auto-hospedan en `public/mediapipe/`, generados en `prebuild`
  por `scripts/mediapipe-assets.mjs`.
- **Intenta GPU y cae a CPU** si no hay WebGL disponible (Safari, aceleración desactivada). Sin
  esa caída el control no arrancaba en varias máquinas.
- **Rendimiento:** vídeo a 320×240, inferencia a 12 cuadros por segundo, y baja a 3 cuando no
  hay una mano a la vista. El bucle vive sobre refs y solo re-renderiza cuando cambia algo
  visible — nunca una vez por cuadro (ver regla 2 de `AGENTS.md`).
- **Una sola pestaña a la vez:** si la app está abierta en dos, la última que enciende se queda
  la cámara y la otra se apaga (`lib/gestures/camera-lock.ts`).
- **Con dos manos en cuadro** se atiende la que está más cerca de la cámara.

La lógica está separada en capas puras y probadas (`lib/gestures/vocabulary.ts`,
`lib/gestures/stabilizer.ts`, `lib/timer-commands.ts`), compartidas con los atajos de teclado
para que la mano y el teclado nunca signifiquen cosas distintas.
