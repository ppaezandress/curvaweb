// Autoplay de videos solo cuando son visibles (ahorra CPU/datos). Global: la home
// y las páginas de servicios lo usan. Observer re-creado limpio en cada navegación.
let videoObserver: IntersectionObserver | null = null;

export function initVideos(): void {
  videoObserver?.disconnect();
  const videos = document.querySelectorAll<HTMLVideoElement>('video[data-autoplay]');
  if (!videos.length) return;

  videoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      });
    },
    { threshold: 0.25 }
  );
  videos.forEach((v) => videoObserver?.observe(v));
}

// Botón de audio para videos destacados ([data-audio-toggle] dentro de [data-video-wrap]).
export function initAudioToggle(): void {
  document.querySelectorAll<HTMLElement>('[data-audio-toggle]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    const wrap = btn.closest('[data-video-wrap]');
    const video = wrap?.querySelector('video');
    if (!video) return;
    btn.addEventListener('click', () => {
      video.muted = !video.muted;
      btn.querySelectorAll('[data-audio-icon]').forEach((ic) => ic.classList.toggle('hidden'));
    });
  });
}
