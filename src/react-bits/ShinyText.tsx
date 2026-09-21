import type { ReactNode } from 'react'
import './ShinyText.css'

type ShinyTextProps = {
  text?: string
  children?: ReactNode
  className?: string
}

export function ShinyText({ text, children, className = '' }: ShinyTextProps) {
  return (
    <span className={`shiny-text ${className}`.trim()}>
      {text ?? children}
    </span>
  )
}
