import { useCallback, useEffect, useRef, useState } from 'react'
import { isTypingTarget, prefersReducedMotion } from './motion-preference'
import { useTheme } from '../theme'

type EasingName = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

type Spark = {
  x: number
  y: number
  angle: number
  startTime: number
}

type ClickSparkProps = {
  sparkColor?: string
  sparkSize?: number
  sparkRadius?: number
  sparkCount?: number
  duration?: number
  easing?: EasingName
  extraScale?: number
}

function easeAt(easing: EasingName, t: number) {
  switch (easing) {
    case 'linear':
      return t
    case 'ease-in':
      return t * t
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    default:
      return t * (2 - t)
  }
}

export function ClickSpark({
  sparkColor,
  sparkSize = 10,
  sparkRadius = 18,
  sparkCount = 8,
  duration = 420,
  easing = 'ease-out',
  extraScale = 1,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sparksRef = useRef<Spark[]>([])
  const frameRef = useRef<number>(0)

  const stop = useCallback(() => {
    if (!frameRef.current) return
    cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
  }, [])

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const nextWidth = Math.max(1, Math.round(rect.width))
    const nextHeight = Math.max(1, Math.round(rect.height))
    if (canvas.width !== nextWidth) canvas.width = nextWidth
    if (canvas.height !== nextHeight) canvas.height = nextHeight
  }, [])

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) {
      stop()
      return
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    sparksRef.current = sparksRef.current.filter((spark) => {
      const elapsed = timestamp - spark.startTime
      if (elapsed >= duration) return false

      const eased = easeAt(easing, elapsed / duration)
      const distance = eased * sparkRadius * extraScale
      const lineLength = sparkSize * (1 - eased)
      ctx.strokeStyle = sparkColor ?? '#e76d4d'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(
        spark.x + distance * Math.cos(spark.angle),
        spark.y + distance * Math.sin(spark.angle),
      )
      ctx.lineTo(
        spark.x + (distance + lineLength) * Math.cos(spark.angle),
        spark.y + (distance + lineLength) * Math.sin(spark.angle),
      )
      ctx.stroke()
      return true
    })

    if (sparksRef.current.length) {
      frameRef.current = requestAnimationFrame(draw)
      return
    }
    stop()
  }, [duration, easing, extraScale, sparkColor, sparkRadius, sparkSize, stop])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
      stop()
    }
  }, [resize, stop])

  useEffect(() => {
    const burst = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      const canvas = canvasRef.current
      if (!canvas) return

      resize()
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const now = performance.now()
      sparksRef.current.push(...Array.from({ length: sparkCount }, (_, index) => ({
        x,
        y,
        angle: (2 * Math.PI * index) / sparkCount,
        startTime: now,
      })))
      if (!frameRef.current) frameRef.current = requestAnimationFrame(draw)
    }

    window.addEventListener('click', burst)
    return () => window.removeEventListener('click', burst)
  }, [draw, resize, sparkCount])

  return (
    <canvas
      ref={canvasRef}
      className="click-spark-layer"
      aria-hidden="true"
    />
  )
}

export function ClickSparkLayer() {
  const { resolved } = useTheme()
  const [reduced, setReduced] = useState(() => prefersReducedMotion())

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  if (reduced) return null
  return (
    <ClickSpark
      sparkColor={resolved === 'dark' ? '#f3c77f' : '#e76d4d'}
      sparkCount={9}
      sparkRadius={20}
    />
  )
}
