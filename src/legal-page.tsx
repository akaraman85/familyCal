import { useEffect } from 'react'
import { CalendarDays } from 'lucide-react'
import type { LegalSection } from './legal'
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from './privacy-content'
import { TERMS_SECTIONS, TERMS_UPDATED } from './terms-content'

function LegalPage({
  title,
  heading,
  updated,
  sections,
  otherHref,
  otherLabel,
}: {
  title: string
  heading: string
  updated: string
  sections: LegalSection[]
  otherHref: string
  otherLabel: string
}) {
  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])

  return (
    <main className="privacy-page">
      <article className="privacy-card">
        <div className="brand-mark privacy-mark"><CalendarDays size={22} /></div>
        <p className="eyebrow">Karaman Calendar</p>
        <h1>{heading}</h1>
        <p className="privacy-updated">Last updated {updated}</p>
        {sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <p className="privacy-home">
          <a href="/">Back to Karaman Calendar</a>
          <span> · </span>
          <a href={otherHref}>{otherLabel}</a>
        </p>
      </article>
    </main>
  )
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy · Karaman Calendar"
      heading="Privacy policy"
      updated={PRIVACY_UPDATED}
      sections={PRIVACY_SECTIONS}
      otherHref="/terms"
      otherLabel="Terms of service"
    />
  )
}

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of service · Karaman Calendar"
      heading="Terms of service"
      updated={TERMS_UPDATED}
      sections={TERMS_SECTIONS}
      otherHref="/privacy"
      otherLabel="Privacy policy"
    />
  )
}
