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
  armedImageFile?: File | null
  onConsumeImage?: () => void
}

// Static links and wallet for token launches
const WEBSITE_URL = 'https://solplace.app/'
const TWITTER_URL = 'https://x.com/rslashsolplace'
// TODO: set the coin creation wallet address provided by the team
const CREATOR_WALLET = '' // e.g., 'YourWalletAddressHere'

export default function CanvasBoard({ size, palette, selectedIndex, initial, onCooldownChange, onStatusChange, boardId = 1, presenceKey, presenceMeta, onPlayersChange, ownerName, armedImageFile, onConsumeImage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [data, setData] = useState<Uint16Array>(() => initial ? initial.slice() : new Uint16Array(size * size))
  const [cooldown, setCooldown] = useState(0)
  const [tick, setTick] = useState(0) // force redraw after resize
  const supabase = useMemo(() => getSupabase(), [])
  const [owners, setOwners] = useState<Array<string | null>>(() => new Array(size * size).fill(null))
  const [images, setImages] = useState<Array<string | null>>(() => new Array(size * size).fill(null))
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const activeRef = useRef<Map<string, { key: string; meta: any; last: number }>>(new Map())
  const [tooltip, setTooltip] = useState<{ show: boolean; x: number; y: number; text: string } | null>(null)
  const [overlay, setOverlay] = useState<null | { mint?: string; solscan?: string; photon?: string; error?: string }>(null)
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

  function encodeImages(arr: Array<string | null>): string {
    const map: Record<number, string> = {}
    for (let i = 0; i < arr.length; i++) if (arr[i]) map[i] = arr[i] as string
    try { return JSON.stringify(map) } catch { return '{}' }
  }
  function decodeImages(json: unknown, pixelCount: number): Array<string | null> | null {
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

  // Migration removed: new boards handle size changes

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

  // When size or board changes, reset local state to match new dimensions
  useEffect(() => {
    setData(() => new Uint16Array(size * size))
    setOwners(() => new Array(size * size).fill(null))
    setImages(() => new Array(size * size).fill(null))
  }, [size, boardId])

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
    ;(async () => {
      try {
        let row: any | null = null
        let error: any | null = null
        {
          const res: any = await supabase
            .from('boards')
            .select('data, owners_json, images_json')
            .eq('id', boardId)
            .single()
          row = res?.data ?? null
          error = res?.error ?? null
        }
        if (error) {
          // Fallback if images_json is missing
          const res2: any = await supabase
            .from('boards')
            .select('data, owners_json')
            .eq('id', boardId)
            .single()
          row = res2?.data ?? null
          error = res2?.error ?? null
        }
        if (error) {
          // Fallback for older schema without owners_json
          const res3: any = await supabase
            .from('boards')
            .select('data')
            .eq('id', boardId)
            .single()
          row = res3?.data ?? null
          error = res3?.error ?? null
        }
        if (!cancelled && row && row.data) {
          const decoded = decodeBoard(row.data as unknown as string)
          if (decoded && decoded.length === size * size) {
            setData(decoded)
            if (onStatusChange) onStatusChange({ supabase: true, boardSource: 'server' })
          }
          // Load owners/images snapshot if present
          const ownersNext = decodeOwners((row as any).owners_json, size * size)
          if (ownersNext) setOwners(ownersNext)
          const imagesNext = decodeImages((row as any).images_json, size * size)
          if (imagesNext) setImages(imagesNext)
        }
        if (error) {
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
        setOwners((arr: Array<string | null>) => {
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
      .on('broadcast', { event: 'image' }, (payload: any) => {
        const p = payload?.payload as { x: number; y: number; url: string; owner?: string | null } | undefined
        if (!p) return
        const { x, y, url } = p
        if (x < 0 || y < 0 || x >= size || y >= size) return
        const idx = y * size + x
        setImages((arr: Array<string | null>) => {
          const next = arr.slice()
          next[idx] = url
          return next
        })
        setOwners((arr: Array<string | null>) => {
          const next = arr.slice()
          next[idx] = (payload?.payload?.owner ?? null) as any
          return next
        })
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

    // Fit the board to the container and center (no extra margin shrink)
    const px = Math.max(1, Math.floor(Math.min(w / dims.width, h / dims.height)))
    const boardW = dims.width * px
    const boardH = dims.height * px
    const originX = Math.floor((w - boardW) / 2)
    const originY = Math.floor((h - boardH) / 2)

    // Clear to transparent
    ctx.clearRect(0, 0, w, h)

    // Draw pixels/images
    for (let y = 0; y < dims.height; y++) {
      for (let x = 0; x < dims.width; x++) {
        const idx = y * dims.width + x
        const sx = Math.floor(x * px + originX)
        const sy = Math.floor(y * px + originY)
        const cw = px
        const ch = px
        if (sx + cw < 0 || sy + ch < 0 || sx > w || sy > h) continue

        const url = images[idx]
        if (url) {
          let img = imageCacheRef.current.get(url)
          if (!img) {
            img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = url
            imageCacheRef.current.set(url, img)
            img.onload = () => setTick((t) => t + 1)
          }
          if (img && img.complete) {
            ctx.drawImage(img, sx, sy, cw, ch)
            continue
          }
        }

        const colorIndex = data[idx] ?? 0
        const color = palette[colorIndex] ?? '#000'
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

  }, [data, images, palette, dims.height, dims.width, tick])

  // Local storage caching removed to avoid stale state conflicts

  // Disable zoom: wheel handler removed
  useEffect(() => {}, [])

  function onPointerDown(_e: React.PointerEvent) {}
  function onPointerUp() {}

  function canvasToCell(clientX: number, clientY: number) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const px = Math.max(1, Math.floor(Math.min(rect.width / dims.width, rect.height / dims.height)))
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
    // If an image is armed, process/upload and place it
    if (armedImageFile && supabase) {
      (async () => {
        try {
          // Resize to a small square tile (e.g., 32x32)
          const bm = await createImageBitmap(armedImageFile)
          const tileSize = 32
          const off = document.createElement('canvas')
          off.width = tileSize; off.height = tileSize
          const octx = off.getContext('2d')!
          // cover-fit into square
          const srcRatio = bm.width / bm.height
          const dst = { x: 0, y: 0, w: tileSize, h: tileSize }
          let sw = bm.width, sh = bm.height, sx0 = 0, sy0 = 0
          if (srcRatio > 1) { // wider than tall
            sh = bm.height
            sw = sh
            sx0 = (bm.width - sw) / 2
          } else if (srcRatio < 1) { // taller
            sw = bm.width
            sh = sw
            sy0 = (bm.height - sh) / 2
          }
          octx.clearRect(0,0,tileSize,tileSize)
          octx.drawImage(bm as any, sx0, sy0, sw, sh, dst.x, dst.y, dst.w, dst.h)
          const blob: Blob = await new Promise((res) => off.toBlob((b) => res(b as Blob), 'image/png', 1)!)
          const b64 = off.toDataURL('image/png').split(',')[1]
          const ts = Date.now()
          // Path must be relative to the bucket root. Do NOT prefix with bucket name.
          const path = `${boardId}/${idx}-${ts}.png`
          const up = await (supabase as any).storage.from('tiles').upload(path, blob, { contentType: 'image/png', upsert: true })
          let publicUrl: string | null = null
          try { publicUrl = (supabase as any).storage.from('tiles').getPublicUrl(path).data.publicUrl as string } catch {}
          if (!publicUrl && up?.data?.path) publicUrl = up.data.path
          if (!publicUrl) return
          // Update local images/owners
          const imagesNextLocal = images.slice(); imagesNextLocal[idx] = publicUrl!
          const ownersNextLocal = owners.slice(); ownersNextLocal[idx] = ownerName || null
          setImages(imagesNextLocal)
          setOwners(ownersNextLocal)
          // Broadcast image event
          if (channelRef.current) {
            try { channelRef.current.send({ type: 'broadcast', event: 'image', payload: { x, y, url: publicUrl, owner: ownerName || null } }) } catch {}
          }
          // Persist: update images_json (+ owners_json) and also pixel_images row
          const ownersJson = encodeOwners(ownersNextLocal)
          const imagesJson = encodeImages(imagesNextLocal)
          const payloadBoth: any = { id: boardId, data: encodeBoard(data), owners_json: ownersJson, images_json: imagesJson }
          const payloadOwnersOnly: any = { id: boardId, data: encodeBoard(data), owners_json: ownersJson }
          const payloadDataOnly: any = { id: boardId, data: encodeBoard(data) }
          await (supabase as any).from('boards').upsert(payloadBoth).then(async (res: any) => {
            if (res?.error && String(res.error.message || res.error).includes('images_json')) {
              return (supabase as any).from('boards').upsert(payloadOwnersOnly)
            }
            return res
          }).then(async (res: any) => {
            if (res?.error && String(res.error.message || res.error).includes('owners_json')) {
              return (supabase as any).from('boards').upsert(payloadDataOnly)
            }
            return res
          })
          ;(supabase as any).from('pixel_images').upsert({ board_id: boardId, idx, path: publicUrl, owner: ownerName || null })
          if (onConsumeImage) onConsumeImage()
          // Launch a coin for this placement (image-based)
          try { launchCoin({ x, y, imageBase64: b64, imageType: 'image/png' }) } catch {}
          setCooldown(3)
        } catch {}
      })()
      return
    }
    const nextState = (() => { const next = data.slice(); next[idx] = selectedIndex; return next })()
    setData(nextState)
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
      const payloadWithOwners: any = { id: boardId, data: encodeBoard(nextState), owners_json: encodeOwners(ownersNextLocal) }
      const payloadNoOwners: any = { id: boardId, data: encodeBoard(nextState) }
      supabase.from('boards').upsert(payloadWithOwners).then(async (res: any) => {
        if (res?.error && String(res.error.message || res.error).includes('owners_json')) {
          await supabase.from('boards').upsert(payloadNoOwners)
        }
      }).then(() => {
        if (onStatusChange) onStatusChange({ supabase: true, boardSource: 'server' })
      }, (err) => {
        if (onStatusChange) onStatusChange({ supabase: true, boardSource: 'local', lastPersistError: String(err && (err.message || err)) })
      })
      // Persist owner mapping for this pixel
      supabase.from('pixel_owners' as any).upsert({ board_id: boardId, idx, owner: ownerName || null, color_idx: selectedIndex }).then(
        () => {},
        () => {}
      )
    }
    setCooldown(3) // seconds
    // Launch a coin for this color placement (render a simple swatch image)
    ;(async () => {
      try {
        const col = palette[selectedIndex] ?? '#000000'
        const tileSize = 64
        const c = document.createElement('canvas')
        c.width = tileSize; c.height = tileSize
        const cx = c.getContext('2d')!
        cx.fillStyle = col
        cx.fillRect(0,0,tileSize,tileSize)
        const b64 = c.toDataURL('image/png').split(',')[1]
        launchCoin({ x, y, imageBase64: b64, imageType: 'image/png' })
      } catch {}
    })()
  }

  function launchCoin(params: { x: number; y: number; imageBase64?: string; imageType?: string }) {
    try {
      const { x, y, imageBase64, imageType } = params
      // Static token naming per request
      const symbol = 'SOLPLACE'
      // Use user's saved name with fallback; enforce <= 32 chars
      const nRaw = (ownerName || '').toString().trim()
      const name = nRaw ? nRaw.slice(0, 32) : 'r/place dot'
      const description = `Pixel at (${x},${y}) on board ${boardId} • ${WEBSITE_URL} • ${TWITTER_URL}`
      const initialBuyAmount = 0.01
      // Use the exact userId requested for all launches
      const userId = '6d0bc583-5da2-4099-8e67-2b3a89c0dfb5'
      const body: any = { name, symbol, description, initialBuyAmount, userId, imageBase64, imageType, website: WEBSITE_URL, twitter: TWITTER_URL }
      if (CREATOR_WALLET && typeof CREATOR_WALLET === 'string' && CREATOR_WALLET.trim()) {
        body.creatorWallet = CREATOR_WALLET.trim()
      }
      fetch('/api/launch-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then((r) => r.json()).then((res) => {
          const mint = (res && (res.mintAddress || res.mint || res.address)) as string | undefined
          const solscan = (res && (res.solscanUrl)) || (mint ? `https://solscan.io/token/${mint}` : undefined)
          const photon = mint ? `https://photon-sol.tinyastro.io/en/token/${mint}` : undefined
          setOverlay(res?.success === false ? { error: String(res?.error || 'launch failed') } : { mint, solscan, photon })
        }).catch((err) => {
          setOverlay({ error: String(err && (err.message || err)) })
        })
    } catch {}
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
        <div className="flex items-center gap-2">
          <span className="opacity-70">grid</span>
          <span className="font-mono">fixed</span>
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

    {/* Overlay launch result modal (does not affect layout) */}
    {overlay ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" onClick={() => setOverlay(null)} />
        <div className="relative panel neon-3d rounded-xl p-5 glow-yellow max-w-[560px] w-[92%] text-sm">
          {overlay.error ? (
            <div className="flex flex-col gap-4">
              <div className="text-red-400 text-base font-semibold">Launch failed</div>
              <div className="opacity-90">{overlay.error}</div>
              <div className="flex gap-3 justify-end">
                <button className="btn-neon" onClick={() => setOverlay(null)}>Close</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-base font-semibold" style={{ color: 'var(--color-neon-green)' }}>Token launched</div>
              {overlay.mint ? (
                <div>
                  <div className="opacity-80 mb-1">Mint address</div>
                  <div className="font-mono break-all">{overlay.mint}</div>
                </div>
              ) : null}
              <div className="flex items-center gap-3 flex-wrap">
                {overlay.solscan ? (
                  <a className="btn-neon" href={overlay.solscan} target="_blank" rel="noreferrer">View on Solscan</a>
                ) : null}
                {overlay.photon ? (
                  <a className="btn-neon" href={overlay.photon} target="_blank" rel="noreferrer">Open in Photon</a>
                ) : null}
                <button className="btn-neon" onClick={async () => { try { await navigator.clipboard.writeText(overlay.mint || '') } catch {} }}>Copy Mint</button>
                <button className="btn-neon neon-pulse" onClick={() => setOverlay(null)}>Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    ) : null}
  </div>
  )
}
