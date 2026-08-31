import { APP_PUBLIC_NAME, APP_SUPPORT_EMAIL } from './branding'

export const LEGAL_CONTACT_EMAIL = APP_SUPPORT_EMAIL

export type LegalSection = {
  heading: string
  paragraphs: string[]
}

export type LegalDocument = {
  title: string
  description: string
  heading: string
  updated: string
  sections: LegalSection[]
  otherHref: string
  otherLabel: string
}

export function publicLegalDocument(pathname: string): 'privacy' | 'terms' | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/privacy' || path === '/privacy.html') return 'privacy'
  if (path === '/terms' || path === '/terms.html') return 'terms'
  return null
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function renderLegalHtml(document: LegalDocument) {
  const sections = document.sections.map((section) => `
      <section>
        <h2>${escapeHtml(section.heading)}</h2>
        ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n        ')}
      </section>`).join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#f5f4f0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="description" content="${escapeHtml(document.description)}" />
    <script>
      (function () {
        try {
          var stored = localStorage.getItem('karaman-theme')
          if (stored === 'light' || stored === 'dark') {
            document.documentElement.setAttribute('data-theme', stored)
          }
          var resolved = stored === 'light' || stored === 'dark'
            ? stored
            : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          var color = resolved === 'dark' ? '#161513' : '#f5f4f0'
          var themeMeta = document.querySelector('meta[name="theme-color"]')
          if (themeMeta) themeMeta.setAttribute('content', color)
        } catch (e) {}
      })()
    </script>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>${escapeHtml(document.title)}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700&display=swap');
      :root {
        color-scheme: light dark;
        --bg: light-dark(#f5f4f0, #161513);
        --ink: light-dark(#292d32, #eceae4);
        --muted: light-dark(#7d817f, #9a9892);
        --line: light-dark(#e7e5df, #34322e);
        --panel: light-dark(#ffffff, #23221e);
        --orange: #e76d4d;
        --shadow: light-dark(0 16px 50px rgba(47, 50, 48, .08), 0 16px 50px rgba(0, 0, 0, .4));
      }
      :root[data-theme="light"] { color-scheme: light; }
      :root[data-theme="dark"] { color-scheme: dark; }
      * { box-sizing: border-box; }
      html { background: var(--bg); }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: 'DM Sans', sans-serif;
        color: var(--ink);
        background: radial-gradient(circle at 50% 10%, var(--panel) 0, var(--bg) 58%);
      }
      main {
        max-width: 720px;
        margin: 0 auto;
        padding: max(32px, env(safe-area-inset-top)) 24px max(48px, env(safe-area-inset-bottom));
      }
      article {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 34px;
        box-shadow: var(--shadow);
      }
      .brand {
        width: 37px;
        height: 37px;
        border-radius: 11px;
        color: white;
        background: var(--orange);
        display: grid;
        place-items: center;
        font: 700 16px/1 Manrope, sans-serif;
        box-shadow: 0 5px 13px rgba(231,109,77,.24);
        margin-bottom: 23px;
      }
      .eyebrow {
        color: var(--orange);
        text-transform: uppercase;
        letter-spacing: 1.3px;
        font-size: 9px;
        font-weight: 700;
        margin: 0;
      }
      h1 {
        font: 700 25px/1.3 Manrope, sans-serif;
        letter-spacing: -.6px;
        margin: 5px 0 6px;
      }
      .updated { color: var(--muted); font-size: 12px; margin: 0 0 24px; }
      h2 { font: 600 16px/1.35 Manrope, sans-serif; margin: 22px 0 8px; }
      p { color: var(--ink); font-size: 14px; line-height: 1.65; margin: 0 0 10px; }
      a { color: var(--orange); }
      .home { margin: 28px 0 0; font-size: 13px; }
      .home span { color: var(--muted); }
    </style>
  </head>
  <body>
    <main>
      <article>
        <div class="brand" aria-hidden="true">K</div>
        <p class="eyebrow">${APP_PUBLIC_NAME}</p>
        <h1>${escapeHtml(document.heading)}</h1>
        <p class="updated">Last updated ${escapeHtml(document.updated)}</p>
        ${sections}
        <p class="home"><a href="/">Back to ${APP_PUBLIC_NAME}</a><span> · </span><a href="${escapeHtml(document.otherHref)}">${escapeHtml(document.otherLabel)}</a></p>
      </article>
    </main>
  </body>
</html>
`
}
