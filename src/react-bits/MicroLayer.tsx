import type { ReactNode } from 'react'
import { ClickSparkLayer } from './ClickSpark'

export function MicroLayer({ children }: { children: ReactNode }) {
  return (
    <>
      <ClickSparkLayer />
      {children}
    </>
  )
}
