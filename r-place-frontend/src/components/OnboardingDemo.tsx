import { useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }

export default function OnboardingDemo() {
  const [show, setShow] = useState(() => {
    try { return localStorage.getItem('rplace_demo_v1') !== 'done' } catch { return true }
  })
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const rippleRef = useRef<HTMLDivElement | null>(null)
  const dotRef = useRef<HTMLDivElement | null>(null)
  const cursor2Ref = useRef<HTMLDivElement | null>(null)
  const ripple2Ref = useRef<HTMLDivElement | null>(null)
  const dot2Ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!show) return
    const swatch = document.querySelector('[data-demo-swatch="true"]') as HTMLElement | null
    const canvas = document.querySelector('[data-board-canvas="true"]') as HTMLElement | null
    if (!swatch || !canvas) return
    const sRect = swatch.getBoundingClientRect()
    // Try target swatch below the selected
    let targetSwatch: HTMLElement = swatch
    const idxStr = swatch.getAttribute('data-swatch-index')
    if (idxStr) {
      const idx = parseInt(idxStr, 10)
      const cand = document.querySelector(`[data-swatch-index="${idx + 2}"]`) as HTMLElement | null
      if (cand) targetSwatch = cand
    }
    const tRect = targetSwatch.getBoundingClientRect()
    const cRect = canvas.getBoundingClientRect()
    const start: Point = { x: tRect.left + tRect.width * 0.2, y: tRect.top - 60 }
    const pick: Point = { x: tRect.left + tRect.width / 2, y: tRect.top + tRect.height / 2 }
    const place: Point = { x: cRect.left + cRect.width * 0.5, y: cRect.top + cRect.height * 0.5 }
    const start2: Point = {
      x: place.x < window.innerWidth / 2 ? window.innerWidth + 140 : -140,
      y: pick.y + 60,
    }

    const t0 = performance.now()
    const total = 4500 // include second user

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
    function ease(t: number) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t }

    let raf: number | null = null
    function frame(now: number) {
      const el = cursorRef.current
      const ripple = rippleRef.current
      const dot = dotRef.current
      const el2 = cursor2Ref.current
      const ripple2 = ripple2Ref.current
      const dot2 = dot2Ref.current
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
        ripple.style.transform = `translate(${pick.x - 18}px, ${pick.y - 18}px) scale(${1 + (dt-1200)/300})`
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
          ripple.style.transform = `translate(${place.x - 18}px, ${place.y - 18}px) scale(${1 + (dt-3400)/400})`
        }
        if (dot) {
          dot.style.opacity = '1'
          dot.style.transform = `translate(${place.x - 8}px, ${place.y - 8}px)`
        }
      }
      // Opponent cursor path (2.2s - 3.4s)
      if (el2 && dt > 2200 && dt <= 3400) {
        const t = ease((dt - 2200) / 1200)
        const x = lerp(start2.x, place.x, t)
        const y = lerp(start2.y, place.y, t)
        el2.style.transform = `translate(${x}px, ${y}px)`
      }
      // Opponent click (3.4s - 4.0s)
      if (dt > 3400 && dt <= 4000) {
        if (ripple2) {
          ripple2.style.opacity = '1'
          ripple2.style.transform = `translate(${place.x - 18}px, ${place.y - 18}px) scale(${1 + (dt-3400)/600})`
        }
        if (dot2) {
          dot2.style.opacity = '1'
          dot2.style.transform = `translate(${place.x - 8}px, ${place.y - 8}px)`
        }
      }
      // Phase 5: fade out (3.8s - 4s)
      if (dt > 3800) {
        if (dot) dot.style.opacity = String(Math.max(0, 1 - (dt-3800)/200))
        if (dot2) dot2.style.opacity = String(Math.max(0, 1 - (dt-3800)/260))
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
        <svg width="88" height="88" viewBox="0 0 24 24" fill="white" style={{ filter: 'drop-shadow(0 0 16px rgba(255,255,255,0.95))' }}>
          <path d="M3 2l8 14 2-5 6-2L3 2z" />
        </svg>
      </div>
      {/* ripple */}
      <div ref={rippleRef} style={{ position: 'absolute', width: 36, height: 36, borderRadius: 9999, border: '3px solid rgba(255,255,255,0.85)', opacity: 0, transform: 'translate(-100px,-100px) scale(1)', transition: 'opacity 120ms linear' }} />
      {/* temp dot */}
      <div ref={dotRef} style={{ position: 'absolute', width: 16, height: 16, borderRadius: 9999, background: 'var(--color-neon-magenta)', boxShadow: '0 0 10px rgba(255,60,247,0.65)', opacity: 0, transform: 'translate(-100px,-100px)' }} />

      {/* opponent cursor and effects */}
      <div ref={cursor2Ref} style={{ position: 'absolute', transform: 'translate(-100px,-100px)' }}>
        <svg width="80" height="80" viewBox="0 0 24 24" fill="#F9FF00" style={{ filter: 'drop-shadow(0 0 14px rgba(249,255,0,0.9))' }}>
          <path d="M3 2l8 14 2-5 6-2L3 2z" />
        </svg>
      </div>
      <div ref={ripple2Ref} style={{ position: 'absolute', width: 36, height: 36, borderRadius: 9999, border: '3px solid rgba(249,255,0,0.9)', opacity: 0, transform: 'translate(-100px,-100px) scale(1)', transition: 'opacity 120ms linear' }} />
      <div ref={dot2Ref} style={{ position: 'absolute', width: 16, height: 16, borderRadius: 9999, background: 'var(--color-neon-yellow)', boxShadow: '0 0 10px rgba(249,255,0,0.65)', opacity: 0, transform: 'translate(-100px,-100px)' }} />
    </div>
  )
}
