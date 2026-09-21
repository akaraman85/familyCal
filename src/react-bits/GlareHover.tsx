import type { ComponentPropsWithoutRef, CSSProperties, ElementType, ReactNode } from 'react'
import './GlareHover.css'

type GlareHoverOwnProps = {
  children?: ReactNode
  className?: string
  borderRadius?: string
  glareColor?: string
  glareOpacity?: number
  glareAngle?: number
  glareSize?: number
  transitionDuration?: number
}

type GlareHoverProps<T extends ElementType = 'div'> = GlareHoverOwnProps & {
  as?: T
} & Omit<ComponentPropsWithoutRef<T>, keyof GlareHoverOwnProps | 'as'>

function glareRgba(glareColor: string, glareOpacity: number) {
  const hex = glareColor.replace('#', '')
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${glareOpacity})`
  }
  if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16)
    const g = parseInt(hex[1] + hex[1], 16)
    const b = parseInt(hex[2] + hex[2], 16)
    return `rgba(${r}, ${g}, ${b}, ${glareOpacity})`
  }
  return glareColor
}

export function GlareHover<T extends ElementType = 'div'>({
  as,
  children,
  className = '',
  style,
  borderRadius,
  glareColor = '#ffffff',
  glareOpacity = 0.38,
  glareAngle = -45,
  glareSize = 240,
  transitionDuration = 700,
  ...props
}: GlareHoverProps<T>) {
  const Component = as ?? 'div'
  const vars = {
    '--gh-angle': `${glareAngle}deg`,
    '--gh-duration': `${transitionDuration}ms`,
    '--gh-size': `${glareSize}%`,
    '--gh-rgba': glareRgba(glareColor, glareOpacity),
    ...(borderRadius ? { borderRadius } : {}),
    ...style,
  } as CSSProperties

  return (
    <Component className={`glare-hover ${className}`.trim()} style={vars} {...props}>
      {children}
    </Component>
  )
}
