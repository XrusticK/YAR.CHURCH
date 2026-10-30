import { defineConfig } from 'astro/config';

// На GitHub Pages сайт лежит в подпапке репозитория (https://xrustick.github.io/YAR.CHURCH/).
// SITE_URL и BASE_PATH подставляет сборка на GitHub (.github/workflows/site.yml);
// локально сайт открывается в корне. Со своим доменом BASE_PATH станет пустым — ничего менять не нужно.
export default defineConfig({
  site: process.env.SITE_URL || 'https://xrustick.github.io',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
