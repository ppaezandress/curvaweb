// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// NOTA: actualiza `site` con el dominio de producción real de CURVA.
// Se usa para canonical, og:image absolutas y el sitemap.
export default defineConfig({
  site: 'https://curvaweb.vercel.app',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
