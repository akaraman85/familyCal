import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function rewritePublicLegalPath(request: { url?: string }) {
  const [pathname, search = ''] = (request.url ?? '').split('?')
  const query = search ? `?${search}` : ''
  if (pathname === '/privacy' || pathname === '/privacy/') {
    request.url = `/privacy.html${query}`
  } else if (pathname === '/terms' || pathname === '/terms/') {
    request.url = `/terms.html${query}`
  }
}

export default defineConfig({
  plugins: [
    {
      name: 'public-legal-paths',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          rewritePublicLegalPath(request)
          next()
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use((request, _response, next) => {
          rewritePublicLegalPath(request)
          next()
        })
      },
    },
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'favicon-32x32.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        id: '/',
        name: 'Karaman Calendar',
        short_name: 'Karaman',
        description: 'The Karaman family calendar',
        lang: 'en',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'any',
        background_color: '#f5f4f0',
        theme_color: '#f5f4f0',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-192x192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
