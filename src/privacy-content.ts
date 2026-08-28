// After changing this file, regenerate the static page:
// npx tsx scripts/write-privacy-html.ts

export const PRIVACY_CONTACT_EMAIL = 'alexkaraman85@gmail.com'
export const PRIVACY_UPDATED = 'August 28, 2026'

export type PrivacySection = {
  heading: string
  paragraphs: string[]
}

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    heading: 'Who this is for',
    paragraphs: [
      'Karaman Calendar (also called Family Calendar) is a private household calendar dashboard for a single family. It is not a public or multi-family product.',
    ],
  },
  {
    heading: 'Sign-in',
    paragraphs: [
      'Calendars, family data, and Google connections require a shared household login. That session is kept in an HTTP-only cookie for 12 hours. This privacy policy is public and does not require that login.',
    ],
  },
  {
    heading: 'Google Calendar',
    paragraphs: [
      'Connecting Google Calendar requests only openid, email, profile, and read-only Calendar access (https://www.googleapis.com/auth/calendar.readonly). The app cannot create, change, or delete Google events.',
      'Google events are displayed on the household dashboard. They are not imported as family events.',
    ],
  },
  {
    heading: 'Where Google credentials are stored',
    paragraphs: [
      'Google access and refresh tokens are encrypted with AES-256-GCM and stored in Postgres. The browser never receives those provider credentials. It only receives the event details needed to draw the calendar.',
      'A short server-side cache of Google events may be kept so the calendar loads quickly. That cache is not an import into the family calendar, and it is deleted when the Google account is disconnected.',
    ],
  },
  {
    heading: 'Household data',
    paragraphs: [
      'Family events, family members, and preferences (calendar views and AI Planner settings) are stored in Postgres for this single-family deployment.',
    ],
  },
  {
    heading: 'Notifications',
    paragraphs: [
      'If Web Push reminders are enabled on an installed device, the push subscription is stored encrypted in Postgres.',
    ],
  },
  {
    heading: 'AI Planner',
    paragraphs: [
      'When an authenticated user submits a planning request, scheduling text and any attached calendar screenshots may be sent to the selected model through Vercel AI Gateway. That happens only for that request. The planner does not save events until the user confirms the proposals.',
    ],
  },
  {
    heading: 'Selling and sharing',
    paragraphs: [
      'We do not sell this data. We do not use it for advertising.',
    ],
  },
  {
    heading: 'Disconnecting Google',
    paragraphs: [
      'Disconnecting a Google account revokes the Google grant and deletes the stored encrypted credentials for that account.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      `Questions about this policy: ${PRIVACY_CONTACT_EMAIL}.`,
    ],
  },
]

export function isPublicPrivacyPath(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === '/privacy' || path === '/privacy.html'
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function renderPrivacyHtml() {
  const sections = PRIVACY_SECTIONS.map((section) => `
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
    <meta name="description" content="Privacy policy for Karaman Calendar, a private household calendar dashboard." />
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
    <title>Privacy policy · Karaman Calendar</title>
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
    </style>
  </head>
  <body>
    <main>
      <article>
        <div class="brand" aria-hidden="true">K</div>
        <p class="eyebrow">Karaman Calendar</p>
        <h1>Privacy policy</h1>
        <p class="updated">Last updated ${escapeHtml(PRIVACY_UPDATED)}</p>
        ${sections}
        <p class="home"><a href="/">Back to Karaman Calendar</a></p>
      </article>
    </main>
  </body>
</html>
`
}
