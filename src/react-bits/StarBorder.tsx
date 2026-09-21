import type { CSSProperties, ReactNode } from 'react'
import './StarBorder.css'

type StarBorderProps = {
  children: ReactNode
  className?: string
  color?: string
  speed?: string
}

export function StarBorder({
  children,
  className = '',
  color = 'var(--forest-gold)',
  speed = '5.5s',
}: StarBorderProps) {
  return (
    <span
      className={`star-border ${className}`.trim()}
      style={{ '--star-color': color, '--star-speed': speed } as CSSProperties}
    >
      <span className="star-border-glow star-border-glow-bottom" aria-hidden="true" />
      <span className="star-border-glow star-border-glow-top" aria-hidden="true" />
      <span className="star-border-inner">{children}</span>
    </span>
  )
}
