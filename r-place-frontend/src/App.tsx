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
  const [placedCount, setPlacedCount] = useState<number>(0)
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
  // Count placed pixels for neon progress
  useEffect(() => {
    let cancelled = false
    async function fetchCount() {
      if (!supabase || !size) return
      try {
        const res = await (supabase as any)
          .from('pixel_owners')
          .select('idx', { count: 'exact', head: true })
          .eq('board_id', boardId)
        const cnt = (res?.count as number) || 0
        if (!cancelled) setPlacedCount(cnt)
      } catch {}
    }
    fetchCount()
    if (!supabase || !size) return
    const ch = supabase
      .channel('pixel-count', { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pixel_owners', filter: `board_id=eq.${boardId}` }, () => { fetchCount() })
      .subscribe()
    return () => { cancelled = true; try { supabase.removeChannel(ch) } catch {} }
  }, [!!supabase, size])
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
                r/solplace
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-5 py-2 rounded-[12px] text-neon-white bg-black hover:bg-black/80 text-sm md:text-base btn-neon neon-pulse btn-neon-white cursor-pointer"
                onClick={() => window.dispatchEvent(new Event('rplace:help:open' as any))}
                title="how it works"
              >how it works</button>
              <button
                className="px-5 py-2 rounded-[12px] text-neon-white bg-black hover:bg-black/80 text-sm md:text-base btn-neon neon-pulse btn-neon-white cursor-pointer"
                onClick={() => window.open('https://x.com/rslashsolplace', '_blank')}
                title="x"
              >x</button>
            </div>
          </div>
          {/* neon volume progress bar */}
          <div className="mt-3">
            <div className="neon-progress">
              <div className="neon-progress-fill" style={{ width: `${size ? Math.min(100, Math.round((placedCount / (size*size)) * 100)) : 0}%` }} />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-[1200px] w-full px-4 py-6 flex gap-6 items-start" style={{ maxWidth: mainMaxWidth }}>
        <div ref={canvasPanelRef} className={`panel rounded-lg p-3 md:p-4 glow-cyan flex-1 min-w-0 ${placeCue ? 'grid-neon-highlight' : ''}`} style={{ position: 'relative' }}>
          {placeCue ? (
            <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
              <div className="text-neon-white neon-pulse" style={{ fontWeight: 800, fontSize: 'clamp(14px, 3vw, 20px)' }}>
                place your pixel on any available slot!
              </div>
            </div>
          ) : null}
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
            <div className="section-title mb-2 text-neon-white">Set screen name, then either upload an image or select a color to contribute</div>
            <p className="text-xs opacity-75 mb-2 text-neon-white">set your username</p>
            <div className="flex gap-2 items-center p-2 rounded-[12px] btn-neon-white" style={{ background: 'rgba(0,0,0,0.35)' }}>
              <input
                className="flex-1 bg-transparent rounded-md px-3 py-2 outline-none text-neon-white caret-white placeholder-white/70"
                placeholder="type your name"
                defaultValue={me?.name || ''}
                onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== me?.name) setName(v) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) setName(v) } }}
                maxLength={40}
              />
              <button className="btn-neon btn-neon-white text-neon-white cursor-pointer" onClick={() => {
                const el = document.querySelector<HTMLInputElement>('aside input[placeholder="type your name"]');
                if (el) { const v = el.value.trim(); if (v) setName(v) }
              }}>save</button>
            </div>
          </div>

          {/* image upload just under name - drag & drop */}
          <div className="mb-4">
            <label className="text-xs opacity-80 block mb-2 text-neon-white">upload an image</label>
            <Dropzone onFile={(f) => setArmedImageFile(f)} filename={armedImageFile?.name} />
          </div>

          <h2 className="section-title mb-4 text-neon-white">{placeCue ? 'place your pixel!' : 'select a color to place!'}</h2>
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

      {/* how to play banner: always show on visit (dismissible), not gated by name */}
      <TutorialCard />
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

function Dropzone({ onFile, filename }: { onFile: (f: File) => void; filename?: string | null }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [active, setActive] = useState(false)
  function openDialog() { inputRef.current?.click() }
  function onFiles(files?: FileList | null) {
    const f = files && files[0]
    if (f && /image\/(png|jpe?g|webp)/i.test(f.type)) onFile(f)
  }
  return (
    <div
      className={`dropzone-neon ${active ? 'active' : ''}`}
      style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      onClick={openDialog}
      onDragOver={(e) => { e.preventDefault(); setActive(true) }}
      onDragEnter={(e) => { e.preventDefault(); setActive(true) }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => { e.preventDefault(); setActive(false); onFiles(e.dataTransfer?.files) }}
      role="button"
      aria-label="Upload image"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => { onFiles(e.currentTarget.files); e.currentTarget.value = '' }}
      />
      <div className="text-neon-white text-center">
        <div style={{ fontSize: 22, lineHeight: 1 }}>&uarr;</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{filename || 'Upload image here or select a color below'}</div>
      </div>
    </div>
  )
}

function TutorialCard() {
  // Always show on initial load/refresh; user can dismiss for the current session
  const [open, setOpen] = useState(true)
  useEffect(() => {
    function onOpen() { setOpen(true) }
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
        className="text-sm glow-cyan"
        style={{
          borderRadius: 12,
          padding: '20px 18px',
          border: '1px solid rgba(255,255,255,0.22)',
          background: '#000'
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-full">
            <div className="font-semibold ticker-glow text-center text-neon-white" style={{ marginBottom: 12, fontSize: 'clamp(24px, 4.6vw, 36px)' }}>Welcome to r/solplace</div>
            <p className="text-center text-neon-white" style={{ margin: 0, lineHeight: 1.6, fontSize: 'clamp(14px, 2.3vw, 18px)' }}>
              inspired by the legendary r/place! solplace is a digital communal mural where the community contributes together.
              each contribution is stored on-chain. when all pixels are placed, we'll host a virtual auction on twitch with a known
              third-party auctioneer. a percentage of trading fees and auction proceeds go back to contributors.
            </p>
            <div className="font-semibold text-center text-neon-white" style={{ marginTop: 12, marginBottom: 6, fontSize: 'clamp(16px, 2.8vw, 20px)' }}>How to contribute</div>
            <ul className="text-center text-neon-white" style={{ margin: 0, paddingLeft: 0, lineHeight: 1.7, listStylePosition: 'inside', fontSize: 'clamp(14px, 2.4vw, 18px)' }}>
              <li>set your username and your wallet address</li>
              <li>place a pixel by uploading an image or selecting a color from the palette</li>
              <li>drag onto the canvas grid — boom! your contribution is tokenized</li>
              <li>each contribution triggers a token deployment for the entire blockchain to see</li>
            </ul>
          </div>
          <div className="w-full flex items-center justify-center pt-1">
            <button
              className="btn-neon neon-pulse btn-neon-white cursor-pointer text-neon-white"
              onClick={() => setOpen(false)}
              style={{ padding: '14px 26px', fontSize: 18, fontWeight: 800, background: '#000', borderRadius: 12 }}
            >Start now</button>
          </div>
        </div>
      </div>
    </div>
  )
}
