import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '../lib/supabaseClient'

type Props = {
  size: number
  palette: string[]
  selectedIndex: number
  initial?: Uint16Array
  onCooldownChange?: (seconds: number) => void
  onStatusChange?: (s: { supabase: boolean; boardSource: 'server' | 'local' | null; lastPersistError?: string }) => void
}

export default function CanvasBoard({ size, palette, selectedIndex, initial, onCooldownChange, onStatusChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [data, setData] = useState<Uint16Array>(() => {
    try {
      const saved = localStorage.getItem('rplace_board_v1')
      if (saved) {
        const binary = atob(saved)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return new Uint16Array(bytes.buffer)
      }
    } catch {}
    return initial ? initial.slice() : new Uint16Array(size * size)
  })
  const scale = 3
  const [cooldown, setCooldown] = useState(0)
  const [tick, setTick] = useState(0) // force redraw after resize
  const supabase = useMemo(() => getSupabase(), [])
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

  // Supabase: load initial board and subscribe to realtime pixel updates
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
          .select('data')
          .eq('id', 1)
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
        }
        if (error) {
          // ignore: table may not exist yet
          if (onStatusChange) onStatusChange({ supabase: true, boardSource: 'local' })
        }
      } catch {}
    })()
    const channel = supabase
      .channel('board-1', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'pixel' }, (payload: any) => {
        const p = payload?.payload as { x: number; y: number; colorIndex: number } | undefined
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
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      cancelled = true
      if (channelRef.current && supabase) supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [supabase, size])

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width
    const h = canvas.height

    // Center the board within the canvas
    const px = Math.max(1, scale)
    const boardW = dims.width * px
    const boardH = dims.height * px
    const originX = Math.floor((w - boardW) / 2)
    const originY = Math.floor((h - boardH) / 2)

    // Clear bg
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, w, h)

    // Draw pixels
    for (let y = 0; y < dims.height; y++) {
      for (let x = 0; x < dims.width; x++) {
        const idx = y * dims.width + x
        const colorIndex = data[idx] ?? 0
        const color = palette[colorIndex] ?? '#000'
        const sx = Math.floor(x * px + originX)
        const sy = Math.floor(y * px + originY)
        if (sx + px < 0 || sy + px < 0 || sx > w || sy > h) continue
        ctx.fillStyle = color
        ctx.fillRect(sx, sy, px, px)
      }
    }

    // Grid lines: always visible and higher contrast
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    for (let y = 0; y <= dims.height; y++) {
      const yy = Math.floor(y * scale + originY) + 0.5
      if (yy < 0 || yy > h) continue
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke()
    }
    for (let x = 0; x <= dims.width; x++) {
      const xx = Math.floor(x * scale + originX) + 0.5
      if (xx < 0 || xx > w) continue
      ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, h); ctx.stroke()
    }

  }, [data, offset, scale, palette, dims.height, dims.width, tick])

  // Persist board to localStorage (debounced)
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const bytes = new Uint8Array(data.buffer)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        localStorage.setItem('rplace_board_v1', btoa(bin))
      } catch {}
    }, 200)
    return () => clearTimeout(id)
  }, [data])

  // Disable zoom: wheel handler removed
  useEffect(() => {}, [])

  function onPointerDown(_e: React.PointerEvent) {}
  function onPointerMove(_e: React.PointerEvent) {}
  function onPointerUp() {}

  function canvasToCell(clientX: number, clientY: number) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const px = Math.max(1, scale)
    const boardW = dims.width * px
    const boardH = dims.height * px
    const originX = Math.floor((rect.width - boardW) / 2)
    const originY = Math.floor((rect.height - boardH) / 2)
    const x = Math.floor((clientX - rect.left - originX) / scale)
    const y = Math.floor((clientY - rect.top - originY) / scale)
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
    // Broadcast realtime update
    if (supabase && channelRef.current) {
      try {
        channelRef.current.send({ type: 'broadcast', event: 'pixel', payload: { x, y, colorIndex: selectedIndex } })
      } catch {}
    }
    // Persist board snapshot (simple last-write-wins)
    if (supabase && nextState) {
      const payload = { id: 1, data: encodeBoard(nextState) }
      // Use then(success, failure) to avoid PromiseLike catch type issue in TS
      supabase.from('boards').upsert(payload).then(
        () => {
          if (onStatusChange) onStatusChange({ supabase: true, boardSource: 'server' })
        },
        (err) => {
          if (onStatusChange) onStatusChange({ supabase: true, boardSource: 'local', lastPersistError: String(err && (err.message || err)) })
        }
      )
    }
    setCooldown(5) // seconds
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

      <div className="relative w-full aspect-square overflow-hidden rounded-md neon-border interaction-surface">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair bg-black/30"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={onClick}
        />
        <div className="pointer-events-none absolute inset-0 border border-white/10"></div>
      </div>

      <div className="text-xs opacity-70">
        <p>scroll to zoom • drag to pan • click to place</p>
      </div>
    </div>
  )
}
