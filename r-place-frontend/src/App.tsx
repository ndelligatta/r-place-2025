import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import TickerBar from './components/TickerBar'
import CanvasBoard from './components/CanvasBoard'
import Palette from './components/Palette'
import BackgroundShader from './components/BackgroundShader'
import OnboardingDemo from './components/OnboardingDemo'
import DemoCta from './components/DemoCta'
import { getSupabase } from './lib/supabaseClient'
// NamePrompt overlay removed per request; inline name entry is in the sidebar

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
  const boardId = 2
  const supabase = getSupabase()
  // Load grid size from Supabase (fallback to 32 if unavailable)
  const [size, setSize] = useState<number | null>(null)
  useEffect(() => {
    let aborted = false
    ;(async () => {
      // If Supabase is not configured (local dev), use default
      if (!supabase) { setSize(32); return }
      try {
        const { data, error } = await (supabase as any)
          .from('boards')
          .select('size')
          .eq('id', boardId)
          .single()
        if (aborted) return
        if (error) { setSize(32); return }
        const n = Number((data && (data as any).size) ?? 32)
        setSize(Number.isFinite(n) && n > 0 ? n : 32)
      } catch {
        if (!aborted) setSize(32)
      }
    })()
    return () => { aborted = true }
  }, [!!supabase])
  const initial = useMemo(() => (size ? new Uint16Array(size * size).fill(0) : undefined), [size])
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
  // Inline name entry replaces modal
  function setName(name: string) {
    const id = me?.id || ('guest_' + Math.random().toString(36).slice(2, 10))
    const color = me?.color || DEFAULT_COLORS[(2 + Math.floor(Math.random() * (DEFAULT_COLORS.length - 2))) % DEFAULT_COLORS.length]
    const obj = { id, name, color }
    setMe(obj)
    try { localStorage.setItem('rplace_profile_v2', JSON.stringify(obj)) } catch {}
  }

  const [players, setPlayers] = useState<Array<{ key: string; meta: any }>>([])
  const [armedImageFile, setArmedImageFile] = useState<File | null>(null)
  const [placeCue, setPlaceCue] = useState(false)
  function triggerPlaceCue() {
    setPlaceCue(true)
    window.clearTimeout((triggerPlaceCue as any)._t)
    ;(triggerPlaceCue as any)._t = window.setTimeout(() => setPlaceCue(false), 6000)
  }

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

  const mainMaxWidth = useMemo(() => (size && size >= 64 ? 1400 : 1200), [size])

  return (
    <div className="min-h-screen flex flex-col" style={{ position: 'relative', zIndex: 1 }}>
      <BackgroundShader />
      <TickerBar />

      <header className="sticky top-0 z-20 panel glow-cyan">
        <div className="mx-auto max-w-[1200px] px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="w-24" />
            <div className="text-center flex-1">
              <h1 className="epic-title" style={{ fontSize: 'clamp(28px, 6vw, 56px)' }}>
                r/place '25
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1 rounded border border-white text-white bg-black hover:bg-black/80 text-xs md:text-sm"
                onClick={() => window.dispatchEvent(new Event('rplace:help:open' as any))}
                title="how it works"
              >how it works</button>
              <button
                className="px-3 py-1 rounded border border-white text-white bg-black hover:bg-black/80 text-xs md:text-sm"
                onClick={() => window.open('https://x.com', '_blank')}
                title="x"
              >x</button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-[1200px] w-full px-4 py-6 flex gap-6 items-start" style={{ maxWidth: mainMaxWidth }}>
        <div ref={canvasPanelRef} className="panel rounded-lg p-3 md:p-4 glow-cyan flex-1 min-w-0">
          {size ? (
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
              armedImageFile={armedImageFile}
              onConsumeImage={() => setArmedImageFile(null)}
            />
          ) : (
            <div className="w-full aspect-square flex items-center justify-center opacity-80 text-sm">Loading canvas…</div>
          )}
        </div>
        <aside
          className="panel neon-3d rounded-lg p-4 glow-magenta w-[420px] shrink-0 flex flex-col"
          style={{ height: asideHeight ? `${asideHeight}px` : undefined }}
        >
          {/* inline name chooser */}
          <div className="mb-4">
            <div className="section-title mb-2">choose your name</div>
            <p className="text-xs opacity-75 mb-2">show up on the canvas. change anytime.</p>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-transparent border rounded-md px-3 py-2 outline-none text-white caret-white placeholder-white/70 border-white/30"
                placeholder="type your name"
                defaultValue={me?.name || ''}
                onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== me?.name) setName(v) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) setName(v) } }}
                maxLength={40}
              />
              <button className="btn-neon" onClick={() => {
                const el = document.querySelector<HTMLInputElement>('aside input[placeholder="type your name"]');
                if (el) { const v = el.value.trim(); if (v) setName(v) }
              }}>save</button>
            </div>
          </div>

          {/* image upload just under name */}
          <div className="mb-4">
            <label className="text-xs opacity-80 block mb-2">upload an image</label>
            <label className="relative h-12 rounded-md flex items-center justify-between px-3 border border-white/20 bg-black/30 cursor-pointer">
              <span className="text-xs font-semibold opacity-90">choose file…</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.currentTarget.files && e.currentTarget.files[0]
                  if (f) setArmedImageFile(f)
                  e.currentTarget.value = ''
                }}
              />
              <span className="text-[11px] opacity-70 ml-3 truncate max-w-[55%]">{armedImageFile?.name || 'png, jpg, or webp'}</span>
            </label>
          </div>

          <h2 className="section-title mb-4">{placeCue ? 'place your pixel!' : 'palette'}</h2>
          <div className="flex-1 min-h-0">
            <Palette colors={palette} selected={selected} onSelect={(i) => { setSelected(i); triggerPlaceCue() }} cooldown={cooldown} />
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
              <span className="font-mono">{size || '…'}×{size || '…'}</span>
            </div>
          </div>

          {/* removed the connect wallet button per request */}
        </aside>
      </main>

      {/* footer removed per request */}

      {/* Connection badge removed per request */}

      {/* Quick tutorial: only after name set */}
      {me ? <TutorialCard /> : null}
      <DemoCta />
      {me ? <OnboardingDemo /> : null}

      {/* Inline place-your-pixel prompt above grid when armed */}
      {placeCue ? (
        <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 30 }}>
          <div className="btn-neon neon-pulse" style={{ padding: '8px 12px', fontWeight: 800, textTransform: 'none' }}>
            place your pixel to help complete the mural
          </div>
        </div>
      ) : null}
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
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 30,
        width: 'min(92vw, 700px)'
      }}
    >
      <div
        className="text-sm panel glow-cyan"
        style={{
          borderRadius: 12,
          padding: '18px 18px',
          border: '1px solid rgba(255,255,255,0.14)'
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-full">
            <div className="font-semibold ticker-glow text-center" style={{ marginBottom: 8 }}>How to play</div>
            <ul className="text-[13px] md:text-sm" style={{ margin: 0, paddingLeft: '1.1em', lineHeight: 1.5 }}>
              <li>Select a color from the palette</li>
              <li>Click a pixel on the board to paint</li>
              <li>Grid is fixed for precision (no zoom)</li>
              <li>Wait for cooldown before placing again</li>
              <li>Your moves sync live for everyone</li>
            </ul>
          </div>
          <div className="w-full flex items-center justify-center pt-1">
            <button
              className="btn-neon neon-pulse"
              onClick={() => setOpen(false)}
              style={{ padding: '10px 18px', fontSize: 14, fontWeight: 800, background: '#000', color: '#fff', border: '1px solid #fff' }}
            >Start now</button>
          </div>
        </div>
      </div>
    </div>
  )
}
