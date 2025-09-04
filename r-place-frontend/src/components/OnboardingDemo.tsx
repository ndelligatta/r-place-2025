import { useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }

export default function OnboardingDemo() {
  const [show, setShow] = useState(() => {
    try { return localStorage.getItem('rplace_demo_v1') !== 'done' } catch { return true }
  })
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const rippleRef = useRef<HTMLDivElement | null>(null)
  const dotRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!show) return
    const swatch = document.querySelector('[data-demo-swatch="true"]') as HTMLElement | null
    const canvas = document.querySelector('[data-board-canvas="true"]') as HTMLElement | null
    if (!swatch || !canvas) return

    const sRect = swatch.getBoundingClientRect()
    const cRect = canvas.getBoundingClientRect()
    const start: Point = { x: sRect.left + sRect.width * 0.2, y: sRect.top - 40 }
    const pick: Point = { x: sRect.left + sRect.width / 2, y: sRect.top + sRect.height / 2 }
    const place: Point = { x: cRect.left + cRect.width * 0.5, y: cRect.top + cRect.height * 0.5 }

    const t0 = performance.now()
    const total = 4000 // 4s

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
    function ease(t: number) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t }

    let raf: number | null = null
    function frame(now: number) {
      const el = cursorRef.current
      const ripple = rippleRef.current
      const dot = dotRef.current
      if (!el) return
      const dt = now - t0
      const p = Math.min(1, dt / total)

      // Phase 1: move to swatch (0 - 1.2s)
      if (dt <= 1200) {
        const t = ease(dt / 1200)
        const x = lerp(start.x, pick.x, t)
        const y = lerp(start.y, pick.y, t)
        el.style.transform = `translate(${x}px, ${y}px)`
      }
      // Phase 2: click ripple on swatch (1.2s - 1.5s)
      if (dt > 1200 && dt <= 1500 && ripple) {
        ripple.style.opacity = '1'
        ripple.style.transform = `translate(${pick.x - 12}px, ${pick.y - 12}px) scale(${1 + (dt-1200)/300})`
      }
      if (dt > 1500 && ripple) ripple.style.opacity = '0'

      // Phase 3: move to canvas center (1.5s - 3.4s)
      if (dt > 1500 && dt <= 3400) {
        const t = ease((dt - 1500) / 1900)
        const x = lerp(pick.x, place.x, t)
        const y = lerp(pick.y, place.y, t)
        el.style.transform = `translate(${x}px, ${y}px)`
      }
      // Phase 4: show place ripple and a temporary dot (3.4s - 3.8s)
      if (dt > 3400 && dt <= 3800) {
        if (ripple) {
          ripple.style.opacity = '1'
          ripple.style.transform = `translate(${place.x - 12}px, ${place.y - 12}px) scale(${1 + (dt-3400)/400})`
        }
        if (dot) {
          dot.style.opacity = '1'
          dot.style.transform = `translate(${place.x - 6}px, ${place.y - 6}px)`
        }
      }
      // Phase 5: fade out (3.8s - 4s)
      if (dt > 3800) {
        if (dot) dot.style.opacity = String(Math.max(0, 1 - (dt-3800)/200))
      }

      if (p < 1) raf = requestAnimationFrame(frame)
      else {
        try { localStorage.setItem('rplace_demo_v1', 'done') } catch {}
        setTimeout(() => setShow(false), 150)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [show])

  // Allow manual replay via a custom event
  useEffect(() => {
    function onReplay() {
      try { localStorage.removeItem('rplace_demo_v1') } catch {}
      setShow(true)
    }
    window.addEventListener('rplace:demo:play' as any, onReplay)
    return () => window.removeEventListener('rplace:demo:play' as any, onReplay)
  }, [])

  if (!show) return null
  return (
    <div
      aria-hidden
      style={{ position: 'fixed', inset: 0, zIndex: 50, pointerEvents: 'none' }}
    >
      {/* fake cursor */}
      <div ref={cursorRef} style={{ position: 'absolute', transform: 'translate(-100px,-100px)' }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="white" style={{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.9))' }}>
          <path d="M3 2l8 14 2-5 6-2L3 2z" />
        </svg>
      </div>
      {/* ripple */}
      <div ref={rippleRef} style={{ position: 'absolute', width: 24, height: 24, borderRadius: 9999, border: '2px solid rgba(255,255,255,0.8)', opacity: 0, transform: 'translate(-100px,-100px) scale(1)', transition: 'opacity 120ms linear' }} />
      {/* temp dot */}
      <div ref={dotRef} style={{ position: 'absolute', width: 12, height: 12, borderRadius: 9999, background: 'var(--color-neon-magenta)', opacity: 0, transform: 'translate(-100px,-100px)' }} />
    </div>
  )
}
