# Control por gestos

Manejar el cronómetro con la mano, sin tocar el teclado. Para cuando estás en llamada,
escribiendo a mano o lejos de la computadora.

## Las señas

| Seña | Qué hace |
|---|---|
| ☝️ 1 a 3 dedos | Cambia a esa tarea del dock |
| 🖐️ Una palma | Pausa lo que esté corriendo |
| 🙌 Las dos palmas | Sigue con lo último que medías |

Una palma suelta el trabajo, las dos palmas lo retoman. Los dedos, en medio, eligen tarea.

**Las dos palmas es el gesto más seguro que hay**: hace falta tener las dos manos libres y
presentadas a la vez, cosa que no pasa por accidente ni con el celular en la mano.

**Hay tres posturas que no significan nada, a propósito:** el puño (es como queda la mano al
bajarla o al tomar el mouse), los cuatro dedos (se confundía con tres y con la palma, y dependía
de leer bien el pulgar) y el pulgar solo. Que no signifiquen nada es parte de lo que hace
fiable al resto.

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

## Funciona aunque estés en otra app

Este es el punto de la función: cambiar de tarea mientras estás en Figma, en un PDF o en la
llamada, **sin volver a la pestaña**. Viene encendido y se puede apagar (cuesta batería).

Como en ese momento no ves nada en pantalla, hay dos señales:

- **El sonido** te dice que te reconoció y que ejecutó. Por eso conviene no apagarlo si usas
  esto en segundo plano.
- **Al volver a la app** aparece un aviso con lo que pasó mientras no mirabas, con opción de
  deshacerlo. Nunca debería pasar que tu cronómetro cambie y te enteres tres horas después.

Detalle técnico: cuando la pestaña se oculta, el navegador congela `requestAnimationFrame` y
frena los temporizadores de la página a uno por segundo — con eso un gesto de 1.2 s no se
completaría nunca. Por eso el reloj se mueve a un Web Worker
(`lib/gestures/metronome.ts`), que conserva su ritmo en segundo plano. El reconocimiento baja
de 12 a 7 cuadros por segundo mientras no miras, y a 3 si no hay ninguna mano a la vista.

## Ajustarlo a tu mano

**Practicar → Ajustar a mi mano.** Enseñas la mano abierta y luego el puño, cuatro segundos
cada una, y el sistema calcula TUS umbrales: el largo de tus dedos, tu cámara y a qué distancia
te sientas. Es lo que arregla el "a veces no me lee" — los valores de fábrica son una
estimación, y cada mano es distinta. Se guarda en tu equipo y se puede rehacer cuando cambies
de escritorio o de luz.

## Ajustes finos

**Qué tanto sostener la seña:** Rápido (0.8 s) · Normal (1.2 s) · Tranquilo (2 s). Si pasas el
día en videollamadas, ponlo en Tranquilo — así un saludo no te mueve el cronómetro.

**Sonido:** cada acción suena distinto, para saber qué pasó sin mirar la pantalla —
**sube** al arrancar o reanudar, **baja** al pausar, **parejo** al cambiar de tarea, y una nota
grave y sola cuando la seña se entendió pero no aplicaba (por ejemplo, pediste la tarea 3 y solo
hay dos abiertas). Va bajito a propósito porque puede sonar en una llamada. Se puede apagar.

**Precisión.** Una seña solo cuenta si parece hecha a propósito:

- **Presentada a la cámara.** Es el filtro más importante. Una seña se acerca deliberadamente al
  objetivo; sostener el celular, apoyar la mano en la cara o tenerla sobre el teclado la deja a
  la distancia normal del cuerpo. Por debajo de ese tamaño ni se mira qué dedos hay.
- **Una orden a la vez.** Después de ejecutar hay que retirar la mano del encuadre un instante.
  Sin eso, una mano ocupada en otra cosa soltaba ráfagas de comandos: cada cambio de postura
  contaba como una orden nueva.

- **Quieta.** Una seña se sostiene; una mano que se rasca, se acomoda el pelo o va de paso está
  en movimiento. Si se mueve rápido, el cuadro no cuenta.
- **De frente.** Al apoyar la mano en la cara la palma queda de canto y los nudillos se alinean;
  eso se detecta y se descarta.
- **Sin dedos a medias.** Un dedo a medio estirar invalida el cuadro entero, en vez de adivinar.
  Era lo que hacía parpadear entre 3 y 4 dedos.
- **Sin manos lejanas.** Una mano pequeña (alguien al fondo de la sala) se ignora.

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
