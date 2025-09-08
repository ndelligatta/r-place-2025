import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '../lib/supabaseClient'

type Props = {
  size: number
  palette: string[]
  selectedIndex: number
  initial?: Uint16Array
  onCooldownChange?: (seconds: number) => void
  onStatusChange?: (s: { supabase: boolean; boardSource: 'server' | 'local' | null; lastPersistError?: string }) => void
  boardId?: number
  presenceKey?: string
  presenceMeta?: Record<string, any>
  onPlayersChange?: (players: Array<{ key: string; meta: any }>) => void
  ownerName?: string
}

export default function CanvasBoard({ size, palette, selectedIndex, initial, onCooldownChange, onStatusChange, boardId = 1, presenceKey, presenceMeta, onPlayersChange, ownerName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [data, setData] = useState<Uint16Array>(() => {
    try {
      const saved = localStorage.getItem(`rplace_board_v1_${boardId}`)
      if (saved) {
        const binary = atob(saved)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return new Uint16Array(bytes.buffer)
      }
    } catch {}
    return initial ? initial.slice() : new Uint16Array(size * size)
  })
  const [cooldown, setCooldown] = useState(0)
  const [tick, setTick] = useState(0) // force redraw after resize
  const supabase = useMemo(() => getSupabase(), [])
  const [owners, setOwners] = useState<Array<string | null>>(() => new Array(size * size).fill(null))
  const activeRef = useRef<Map<string, { key: string; meta: any; last: number }>>(new Map())
  const [tooltip, setTooltip] = useState<{ show: boolean; x: number; y: number; text: string } | null>(null)
  useEffect(() => {
    if (onStatusChange) onStatusChange({ supabase: !!supabase, boardSource: null })
  }, [!!supabase])
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)

  // Helpers to encode/decode board state as base64
  function encodeBoard(arr: Uint16Array): string {
    const bytes = new Uint8Array(arr.buffer)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }
  function decodeBoard(b64: string): Uint16Array | null {
    try {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new Uint16Array(bytes.buffer)
    } catch {
      return null
    }
  }

  function encodeOwners(arr: Array<string | null>): string {
    const map: Record<number, string> = {}
    for (let i = 0; i < arr.length; i++) if (arr[i]) map[i] = arr[i] as string
    try { return JSON.stringify(map) } catch { return '{}' }
  }
  function decodeOwners(json: unknown, pixelCount: number): Array<string | null> | null {
    if (!json) return null
    try {
      const obj = typeof json === 'string' ? JSON.parse(json) : json
      const next = new Array(pixelCount).fill(null) as Array<string | null>
      for (const k in obj as any) {
        const idx = Number(k)
        if (!Number.isFinite(idx) || idx < 0 || idx >= pixelCount) continue
        const v = (obj as any)[k]
        if (typeof v === 'string' && v) next[idx] = v
      }
      return next
    } catch { return null }
  }

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 0.1)), 100)
    return () => clearInterval(id)
  }, [cooldown])

  // Notify parent about cooldown changes
  useEffect(() => {
    if (onCooldownChange) onCooldownChange(cooldown)
  }, [cooldown, onCooldownChange])

  const dims = useMemo(() => ({ width: size, height: size }), [size])

  // Ensure crisp canvas and redraw on resize
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const setSize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width * dpr))
      const h = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        setTick((t) => t + 1)
      }
    }
    setSize()
    const ro = new ResizeObserver(() => setSize())
    ro.observe(canvas)
    const onResize = () => setSize()
    window.addEventListener('resize', onResize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Helper: emit current active list based on recent pixel placements
  function emitActivePlayers() {
    if (!onPlayersChange) return
    const now = Date.now()
    const ACTIVE_MS = 3 * 60 * 1000 // 3 minutes window
    for (const [k, v] of activeRef.current) {
      if (now - v.last > ACTIVE_MS) activeRef.current.delete(k)
    }
    const list = Array.from(activeRef.current.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(({ key, meta }) => ({ key, meta }))
    onPlayersChange(list)
  }

  // Supabase: load initial board and owners; subscribe to realtime pixel updates
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    const localHasColors = (() => {
      for (let i = 0; i < data.length; i++) if (data[i] !== 0) return true
      return false
    })()
    ;(async () => {
      try {
        const { data: row, error } = await supabase
          .from('boards')
          .select('data, owners_json')
          .eq('id', boardId)
          .single()
        if (!cancelled && row && row.data) {
          const decoded = decodeBoard(row.data as unknown as string)
          if (decoded && decoded.length === size * size) {
            let remoteHasColors = false
            for (let i = 0; i < decoded.length; i++) if (decoded[i] !== 0) { remoteHasColors = true; break }
            // Prefer local if it already has colors; otherwise adopt server snapshot
            if (!localHasColors && remoteHasColors) {
              setData(decoded)
              if (onStatusChange) onStatusChange({ supabase: true, boardSource: 'server' })
            } else {
              if (onStatusChange) onStatusChange({ supabase: true, boardSource: localHasColors ? 'local' : 'server' })
            }
          }
          // Load owners snapshot if present
          const ownersNext = decodeOwners((row as any).owners_json, size * size)
          if (ownersNext) setOwners(ownersNext)
        }
        if (error) {
          // ignore: table may not exist yet
          if (onStatusChange) onStatusChange({ supabase: true, boardSource: 'local' })
        }
      } catch {}

      // Load owners map for this board (optional; ignore errors)
      try {
        const { data: rows } = await supabase
          .from('pixel_owners' as any)
          .select('idx, owner')
          .eq('board_id', boardId)
        if (!cancelled && Array.isArray(rows)) {
          setOwners(() => {
            const next = new Array(size * size).fill(null) as Array<string | null>
            for (const r of rows as Array<{ idx: number; owner: string | null }>) {
              if (typeof r.idx === 'number' && r.idx >= 0 && r.idx < next.length) next[r.idx] = r.owner ?? null
            }
            return next
          })
        }
      } catch {}
    })()
    const channel = supabase
      .channel(`board-${boardId}`, { config: { broadcast: { self: false }, presence: { key: presenceKey || 'anon' } } })
      .on('broadcast', { event: 'pixel' }, (payload: any) => {
        const p = payload?.payload as { x: number; y: number; colorIndex: number; owner?: string | null } | undefined
        if (!p) return
        const { x, y, colorIndex } = p
        if (x < 0 || y < 0 || x >= size || y >= size) return
        const idx = y * size + x
        setData((arr) => {
          if (arr[idx] === colorIndex) return arr
          const next = arr.slice()
          next[idx] = colorIndex
          return next
        })
        setOwners((arr) => {
          const next = arr.slice()
          next[idx] = (payload?.payload?.owner ?? null) as any
          return next
        })
      })
      .on('broadcast', { event: 'active' }, (payload: any) => {
        const p = payload?.payload as { key?: string; meta?: any } | undefined
        const key = (p?.key || (presenceKey || 'anon')) as string
        const meta = p?.meta ?? presenceMeta ?? {}
        const now = Date.now()
        activeRef.current.set(key, { key, meta, last: now })
        emitActivePlayers()
      })
      // Presence kept for connection state only; player list derives from recent activity
      .subscribe()
    channelRef.current = channel

    // Track our presence
    try { channel.track(presenceMeta || {}) } catch {}
    return () => {
      cancelled = true
      if (channelRef.current && supabase) supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [supabase, size, boardId, presenceKey])

  // Update presence metadata without resubscribing the channel
  useEffect(() => {
    if (!supabase) return
    const ch = channelRef.current
    if (!ch) return
    try { ch.track(presenceMeta || {}) } catch {}
  }, [supabase, presenceMeta])

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const rect = canvas.getBoundingClientRect()
    const w = Math.floor(rect.width)
    const h = Math.floor(rect.height)

    // Zoom-out a touch: fit board to 85% of the container and center
    const px = Math.max(1, Math.floor(Math.min(w / dims.width, h / dims.height) * 0.85))
    const boardW = dims.width * px
    const boardH = dims.height * px
    const originX = Math.floor((w - boardW) / 2)
    const originY = Math.floor((h - boardH) / 2)

    // Clear to transparent
    ctx.clearRect(0, 0, w, h)

    // Draw pixels
    for (let y = 0; y < dims.height; y++) {
      for (let x = 0; x < dims.width; x++) {
        const idx = y * dims.width + x
        const colorIndex = data[idx] ?? 0
        const color = palette[colorIndex] ?? '#000'
        const sx = Math.floor(x * px + originX)
        const sy = Math.floor(y * px + originY)
        const cw = px
        const ch = px
        if (sx + cw < 0 || sy + ch < 0 || sx > w || sy > h) continue
        ctx.fillStyle = color
        ctx.fillRect(sx, sy, cw, ch)
      }
    }

    // Grid lines: clipped to board extents for precise fit
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    for (let y = 0; y <= dims.height; y++) {
      const yy = Math.floor(y * px + originY) + 0.5
      ctx.beginPath(); ctx.moveTo(originX, yy); ctx.lineTo(originX + boardW, yy); ctx.stroke()
    }
    for (let x = 0; x <= dims.width; x++) {
      const xx = Math.floor(x * px + originX) + 0.5
      ctx.beginPath(); ctx.moveTo(xx, originY); ctx.lineTo(xx, originY + boardH); ctx.stroke()
    }

    // Board outline to match exact coordinate bounds
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(originX + 0.5, originY + 0.5, boardW, boardH)

  }, [data, palette, dims.height, dims.width, tick])

  // Persist board to localStorage (debounced)
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const bytes = new Uint8Array(data.buffer)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        localStorage.setItem(`rplace_board_v1_${boardId}`, btoa(bin))
      } catch {}
    }, 200)
    return () => clearTimeout(id)
  }, [data, boardId])

  // Disable zoom: wheel handler removed
  useEffect(() => {}, [])

  function onPointerDown(_e: React.PointerEvent) {}
  function onPointerUp() {}

  function canvasToCell(clientX: number, clientY: number) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const px = Math.max(1, Math.floor(Math.min(rect.width / dims.width, rect.height / dims.height) * 0.85))
    const boardW = dims.width * px
    const boardH = dims.height * px
    const originX = Math.floor((rect.width - boardW) / 2)
    const originY = Math.floor((rect.height - boardH) / 2)
    const x = Math.floor((clientX - rect.left - originX) / px)
    const y = Math.floor((clientY - rect.top - originY) / px)
    return { x, y }
  }

  function onClick(e: React.MouseEvent) {
    if (cooldown > 0) return
    const { x, y } = canvasToCell(e.clientX, e.clientY)
    if (x < 0 || y < 0 || x >= dims.width || y >= dims.height) return
    const idx = y * dims.width + x
    let nextState: Uint16Array | null = null
    setData((arr) => {
      const next = arr.slice()
      next[idx] = selectedIndex
      nextState = next
      return next
    })
    // Update owner locally and prepare owners snapshot for persistence
    const ownersNextLocal = owners.slice()
    ownersNextLocal[idx] = ownerName || null
    setOwners(ownersNextLocal)
    // Broadcast realtime update
    if (supabase && channelRef.current) {
      try {
        channelRef.current.send({ type: 'broadcast', event: 'pixel', payload: { x, y, colorIndex: selectedIndex, owner: ownerName || null } })
        // Mark this user as active for the recent window
        channelRef.current.send({ type: 'broadcast', event: 'active', payload: { key: presenceKey || 'anon', meta: presenceMeta || {} } })
      } catch {}
    }
    // Update local active list immediately (no wait for round-trip)
    {
      const key = (presenceKey || 'anon') as string
      const meta = presenceMeta || {}
      activeRef.current.set(key, { key, meta, last: Date.now() })
      emitActivePlayers()
    }
    // Persist board snapshot (simple last-write-wins)
    if (supabase && nextState) {
      const payload: any = { id: boardId, data: encodeBoard(nextState), owners_json: encodeOwners(ownersNextLocal) }
      // Use then(success, failure) to avoid PromiseLike catch type issue in TS
      supabase.from('boards').upsert(payload).then(
        () => {
          if (onStatusChange) onStatusChange({ supabase: true, boardSource: 'server' })
        },
        (err) => {
          if (onStatusChange) onStatusChange({ supabase: true, boardSource: 'local', lastPersistError: String(err && (err.message || err)) })
        }
      )
      // Persist owner mapping for this pixel
      supabase.from('pixel_owners' as any).upsert({ board_id: boardId, idx, owner: ownerName || null, color_idx: selectedIndex }).then(
        () => {},
        () => {}
      )
    }
    setCooldown(3) // seconds
  }

  // Periodically prune stale active entries (no DB, no timers elsewhere)
  useEffect(() => {
    const id = setInterval(() => emitActivePlayers(), 5000)
    return () => clearInterval(id)
  }, [onPlayersChange])

  // Update canvas title on hover to show owner/no owner (minimal UI)
  function onPointerMove(e: React.PointerEvent) {
    const { x, y } = canvasToCell(e.clientX, e.clientY)
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    if (x < 0 || y < 0 || x >= dims.width || y >= dims.height) {
      setTooltip(null)
      canvasEl.title = ''
      return
    }
    const idx = y * dims.width + x
    const owner = owners[idx]
    const text = owner ? String(owner) : 'no owner'
    canvasEl.title = text
    // Position tooltip near cursor within the container
    const container = canvasEl.parentElement as HTMLElement | null
    if (!container) return
    const crect = container.getBoundingClientRect()
    setTooltip({ show: true, x: e.clientX - crect.left + 12, y: e.clientY - crect.top + 12, text })
  }
  function onPointerLeave() {
    setTooltip(null)
    if (canvasRef.current) canvasRef.current.title = ''
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="opacity-70">grid</span>
            <span className="font-mono">fixed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-70">selected</span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-sm border border-white/20" style={{ background: palette[selectedIndex] }} />
              <span className="font-mono opacity-80">{palette[selectedIndex]}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-70">cooldown</span>
          <span className="font-mono" style={{ color: 'var(--color-neon-yellow)' }}>{cooldown.toFixed(1)}s</span>
        </div>
      </div>

      <div className="relative w-full aspect-square overflow-hidden rounded-md interaction-surface">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          data-board-canvas="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onPointerUp={onPointerUp}
          onClick={onClick}
        />
        {tooltip?.show ? (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[140%] bg-black/75 text-white border border-white/25 text-xs px-2 py-1 rounded whitespace-nowrap z-10"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        ) : null}
      </div>

      <div className="text-xs opacity-70">
        <p>scroll to zoom • drag to pan • click to place</p>
      </div>
    </div>
  )
}
