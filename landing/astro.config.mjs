// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// NOTA: actualiza `site` con el dominio de producción real de CURVA.
// Se usa para canonical, og:image absolutas y el sitemap.
// output 'static' + adapter: las páginas siguen pre-renderizadas; solo los
// endpoints con `export const prerender = false` (api/chat, api/transcribe,
// api/checkout) corren como funciones serverless en Vercel.
export default defineConfig({
  site: 'https://curvaweb.vercel.app',
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
