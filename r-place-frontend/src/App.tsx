import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import TickerBar from './components/TickerBar'
import CanvasBoard from './components/CanvasBoard'
import Palette from './components/Palette'
import BackgroundShader from './components/BackgroundShader'
import OnboardingDemo from './components/OnboardingDemo'
import DemoCta from './components/DemoCta'
import NamePrompt from './components/NamePrompt'

const DEFAULT_COLORS = [
  // bases
  '#000000', '#FFFFFF',
  // primary neons (ordered for harmony)
  '#00F7FF', // cyan
  '#FF3CF7', // magenta
  '#F9FF00', // yellow
  '#00FFA3', // green
  '#38B6FF', // electric blue
  '#FF6B00', // neon orange
  '#8A2BE2', // electric violet
  '#FF007F', // hot pink
]

export default function App() {
  const [palette] = useState<string[]>(DEFAULT_COLORS)
  const [selected, setSelected] = useState(2) // start spicy magenta
  const [cooldown, setCooldown] = useState(0)
  const size = 32
  const boardId = 1
  const initial = useMemo(() => new Uint16Array(size * size).fill(0), [])
  const canvasPanelRef = useRef<HTMLDivElement | null>(null)
  const [asideHeight, setAsideHeight] = useState<number | null>(null)

  // Identity: prompt for name on first visit (no random names)
  const [me, setMe] = useState<{ id: string; name: string; color: string } | null>(() => {
    try {
      const saved = localStorage.getItem('rplace_profile_v2')
      if (saved) return JSON.parse(saved)
    } catch {}
    return null
  })
  const [showNamePrompt, setShowNamePrompt] = useState(() => {
    try {
      const saved = localStorage.getItem('rplace_profile_v2')
      return !saved
    } catch { return true }
  })
  useEffect(() => { setShowNamePrompt(!me) }, [me])
  function setName(name: string) {
    const id = me?.id || ('guest_' + Math.random().toString(36).slice(2, 10))
    const color = me?.color || DEFAULT_COLORS[(2 + Math.floor(Math.random() * (DEFAULT_COLORS.length - 2))) % DEFAULT_COLORS.length]
    const obj = { id, name, color }
    setMe(obj)
    try { localStorage.setItem('rplace_profile_v2', JSON.stringify(obj)) } catch {}
  }

  const [players, setPlayers] = useState<Array<{ key: string; meta: any }>>([])

  // Stable presence meta to avoid resubscribe thrash
  const presenceMetaMemo = useMemo(() => (me ? { name: me.name, color: me.color } : undefined), [me?.name, me?.color])

  useLayoutEffect(() => {
    const el = canvasPanelRef.current
    if (!el) return
    const update = () => {
      const h = el.getBoundingClientRect().height
      setAsideHeight(Math.max(360, Math.floor(h * 1.0)))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col" style={{ position: 'relative', zIndex: 1 }}>
      <BackgroundShader />
      <TickerBar />

      <header className="sticky top-0 z-20 panel glow-cyan">
        <div className="mx-auto max-w-[1200px] px-4 py-4">
          <div className="flex items-center justify-center text-center">
            <h1 className="epic-title" style={{ fontSize: 'clamp(28px, 6vw, 56px)' }}>
              r/place '25
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-[1200px] w-full px-4 py-6 flex gap-6 items-start">
        <div ref={canvasPanelRef} className="panel rounded-lg p-3 md:p-4 glow-cyan flex-1 min-w-0">
          <CanvasBoard
            size={size}
            palette={palette}
            selectedIndex={selected}
            initial={initial}
            onCooldownChange={setCooldown}
            boardId={boardId}
            presenceKey={me?.id}
            presenceMeta={presenceMetaMemo}
            onPlayersChange={setPlayers}
            ownerName={me?.name}
          />
        </div>
        <aside
          className="panel neon-3d rounded-lg p-4 glow-magenta w-[420px] shrink-0 flex flex-col"
          style={{ height: asideHeight ? `${asideHeight}px` : undefined }}
        >
          <h2 className="section-title mb-4">Palette</h2>
          <div className="flex-1 min-h-0">
            <Palette colors={palette} selected={selected} onSelect={setSelected} cooldown={cooldown} />
          </div>

          <div className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="opacity-80">Now playing</span>
              <span className="font-mono" style={{ color: 'var(--color-neon-green)' }}>{players.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-80">Cooldown</span>
              <span className="font-mono" style={{ color: 'var(--color-neon-yellow)' }}>5s</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-80">Canvas</span>
              <span className="font-mono">{size}×{size}</span>
            </div>
            {players.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {players.slice(0, 12).map((p, i) => (
                  <span key={i} className="px-2 py-1 rounded text-[11px]" style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)'
                  }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9999, background: p.meta?.color || '#888', marginRight: 6 }} />
                    {p.meta?.name || p.key}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* removed the connect wallet button per request */}
        </aside>
      </main>

      <footer className="mx-auto max-w-[1200px] px-4 py-6 opacity-70 text-xs">
        <span>made for the culture. mod it, fork it, paint it.</span>
      </footer>

      {/* Connection badge removed per request */}

      {/* Quick tutorial: only after name set */}
      {me ? <TutorialCard /> : null}
      <DemoCta />
      {me ? <OnboardingDemo /> : null}

      {/* Name prompt overlay */}
      <NamePrompt open={showNamePrompt} initialName={me?.name} onSubmit={setName} />
    </div>
  )
}

function TutorialCard() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('rplace_help_v1') !== 'dismissed' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('rplace_help_v1', open ? 'open' : 'dismissed') } catch {}
  }, [open])
  useEffect(() => {
    function onOpen() {
      setOpen(true)
      try { localStorage.setItem('rplace_help_v1', 'open') } catch {}
    }
    window.addEventListener('rplace:help:open' as any, onOpen)
    return () => window.removeEventListener('rplace:help:open' as any, onOpen)
  }, [])
  if (!open) return null
  return (
    <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 25, maxWidth: 380 }}>
      <div
        className="text-sm panel glow-cyan"
        style={{
          borderRadius: 12,
          padding: '12px 14px',
          border: '1px solid rgba(255,255,255,0.14)'
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold ticker-glow" style={{ marginBottom: 6 }}>How to play</div>
            <ul style={{ margin: 0, paddingLeft: '1.1em', lineHeight: 1.35 }}>
              <li>Select a color from the palette</li>
              <li>Click a pixel on the board to paint</li>
              <li>Grid is fixed for precision (no zoom)</li>
              <li>Wait for cooldown before placing again</li>
              <li>Your moves sync live for everyone</li>
            </ul>
          </div>
          <button
            className="btn-neon neon-pulse"
            onClick={() => setOpen(false)}
            style={{ padding: '10px 14px', fontSize: 14, fontWeight: 700 }}
          >Got it</button>
        </div>
      </div>
    </div>
  )
}
