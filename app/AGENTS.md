<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reglas del proyecto (aprendidas de bugs reales — no las repitas)

Estas reglas nacen de bugs que YA pasaron en producción. Respétalas.

1. **Overlays (modales, drawers, hojas): usa `useOverlay(open, onClose)`** de `lib/use-overlay.ts` para Escape + scroll-lock. NUNCA metas un `onClose` (u otro callback prop inline) en las deps de un `useEffect` que haga trabajo pesado (`fetch`, `requestAnimationFrame`, `focus`, scroll). Ese callback cambia de identidad en cada render del padre; si el padre re-renderiza seguido (p. ej. un cronómetro en vivo), el efecto corre CADA render → la app se traba. Efectos con side effects pesados van con deps `[open]` y leen callbacks por ref. (Rompió en `Modal` y `TaskDetailDrawer`.)

2. **No pongas hooks de tick en la raíz de una página.** `useLiveElapsed()` (o cualquier `setInterval` que haga `setState`) re-renderiza TODO lo que está debajo. Si lo llamas en el cuerpo de una page component, re-renderiza la página entera cada segundo. Aíslalo en un componente hijo minúsculo que renderice solo lo que cambia (ver `ActiveTimerClock` en `dashboard/page.tsx`).

3. **Media en el chat: usa `<VoiceBubble>` y `<VideoBubble>`** (`components/chat/`), nunca `<audio controls>` / `<video controls>` nativos (se ven distintos y feos por navegador). ESLint lo bloquea con `no-restricted-syntax`.

4. **Antes de usar `getUserMedia` (cámara/mic), revisa `Permissions-Policy` en `next.config.ts`.** Chromium respeta ese header al pie de la letra: `microphone=()` / `camera=()` bloquea el permiso SIN preguntar (Safari lo ignora, así que "funciona en Safari pero no en Chrome/Atlas" = revisa el header). Debe decir `microphone=(self), camera=(self)`.

5. **Métricas vacías van neutras, no con defaults inventados.** Si no hay datos (p. ej. `weekMinutes === 0`), muestra un estado sin dato (aro `—`, factores en 0), nunca un número calculado por defaults que "califique" al usuario. Contradice el principio "acompañar, no sancionar" y confunde. (Pasó con el Pulso: mostraba 25 en ámbar sin haber medido.)

6. **Todo input de texto debe conservar el foco al escribir.** Si un efecto reenfoca (rAF + `.focus()`) y depende de un callback inline, roba el cursor en cada tecla. Verifica escribiendo varias letras seguidas.
