import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { canUsePointerMagnet } from './motion-preference'

type MagnetProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  padding?: number
  disabled?: boolean
  magnetStrength?: number
  activeTransition?: string
  inactiveTransition?: string
  wrapperClassName?: string
  innerClassName?: string
}

export function Magnet({
  children,
  padding = 40,
  disabled = false,
  magnetStrength = 6,
  activeTransition = 'transform 0.28s ease-out',
  inactiveTransition = 'transform 0.45s ease-in-out',
  wrapperClassName = '',
  innerClassName = '',
  style,
  ...props
}: MagnetProps) {
  const magnetRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [enabled, setEnabled] = useState(() => !disabled && canUsePointerMagnet())

  useEffect(() => {
    const sync = () => setEnabled(!disabled && canUsePointerMagnet())
    sync()
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointer = window.matchMedia('(pointer: fine)')
    const hover = window.matchMedia('(hover: hover)')
    motion.addEventListener('change', sync)
    pointer.addEventListener('change', sync)
    hover.addEventListener('change', sync)
    return () => {
      motion.removeEventListener('change', sync)
      pointer.removeEventListener('change', sync)
      hover.removeEventListener('change', sync)
    }
  }, [disabled])

  useEffect(() => {
    if (!enabled) {
      setActive(false)
      setPosition({ x: 0, y: 0 })
      return undefined
    }

    const follow = (event: MouseEvent) => {
      const node = magnetRef.current
      if (!node) return
      const { left, top, width, height } = node.getBoundingClientRect()
      const centerX = left + width / 2
      const centerY = top + height / 2
      const inRange =
        Math.abs(centerX - event.clientX) < width / 2 + padding
        && Math.abs(centerY - event.clientY) < height / 2 + padding
      if (!inRange) {
        setActive(false)
        setPosition({ x: 0, y: 0 })
        return
      }
      setActive(true)
      setPosition({
        x: (event.clientX - centerX) / magnetStrength,
        y: (event.clientY - centerY) / magnetStrength,
      })
    }

    window.addEventListener('mousemove', follow)
    return () => window.removeEventListener('mousemove', follow)
  }, [enabled, magnetStrength, padding])

  const innerStyle: CSSProperties = {
    transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
    transition: active ? activeTransition : inactiveTransition,
    willChange: enabled ? 'transform' : undefined,
  }

  return (
    <div
      ref={magnetRef}
      className={wrapperClassName}
      style={{ position: 'relative', ...style }}
      {...props}
    >
      <div className={innerClassName} style={innerStyle}>
        {children}
      </div>
    </div>
  )
}

export function MagnetCta({
  children,
  fill = false,
  padding = 36,
  magnetStrength = 6,
}: {
  children: ReactNode
  fill?: boolean
  padding?: number
  magnetStrength?: number
}) {
  return (
    <Magnet
      wrapperClassName={fill ? 'magnet-fill' : 'magnet-cta'}
      innerClassName={fill ? 'magnet-fill-inner' : undefined}
      padding={padding}
      magnetStrength={magnetStrength}
    >
      {children}
    </Magnet>
  )
}
