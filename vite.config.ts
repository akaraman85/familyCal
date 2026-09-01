import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { renderRobots, renderSitemap } from './api/_lib/crawler-files.ts'

function publicAppUrlForDev() {
  const configured = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (configured) return configured
  return 'http://localhost:5173'
}

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
        server.middlewares.use((request, response, next) => {
          const pathname = request.url?.split('?')[0] ?? ''
          if (pathname === '/sitemap.xml') {
            response.statusCode = 200
            response.setHeader('Content-Type', 'application/xml; charset=utf-8')
            response.end(renderSitemap(publicAppUrlForDev()))
            return
          }
          if (pathname === '/robots.txt') {
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/plain; charset=utf-8')
            response.end(renderRobots(publicAppUrlForDev()))
            return
          }
          rewritePublicLegalPath(request)
          next()
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = request.url?.split('?')[0] ?? ''
          if (pathname === '/sitemap.xml') {
            response.statusCode = 200
            response.setHeader('Content-Type', 'application/xml; charset=utf-8')
            response.end(renderSitemap(publicAppUrlForDev()))
            return
          }
          if (pathname === '/robots.txt') {
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/plain; charset=utf-8')
            response.end(renderRobots(publicAppUrlForDev()))
            return
          }
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
        name: 'Family Calendar',
        short_name: 'Family Calendar',
        description: 'A private household calendar dashboard with Google Calendar integration, family events, and AI planning.',
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
