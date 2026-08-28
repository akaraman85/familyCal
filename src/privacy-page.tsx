import { useEffect } from 'react'
import { CalendarDays } from 'lucide-react'
import {
  PRIVACY_SECTIONS,
  PRIVACY_UPDATED,
} from './privacy-content'

export function PrivacyPage() {
  useEffect(() => {
    const previous = document.title
    document.title = 'Privacy policy · Karaman Calendar'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <main className="privacy-page">
      <article className="privacy-card">
        <div className="brand-mark privacy-mark"><CalendarDays size={22} /></div>
        <p className="eyebrow">Karaman Calendar</p>
        <h1>Privacy policy</h1>
        <p className="privacy-updated">Last updated {PRIVACY_UPDATED}</p>
        {PRIVACY_SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <p className="privacy-home"><a href="/">Back to Karaman Calendar</a></p>
      </article>
    </main>
  )
}
