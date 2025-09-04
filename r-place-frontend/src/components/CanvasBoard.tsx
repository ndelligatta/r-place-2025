import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '../lib/supabaseClient'

type Props = {
  size: number
  palette: string[]
  selectedIndex: number
  initial?: Uint16Array
}

export default function CanvasBoard({ size, palette, selectedIndex, initial }: Props) {
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
  const [scale, setScale] = useState(6)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [last, setLast] = useState({ x: 0, y: 0 })
  const [cooldown, setCooldown] = useState(0)
  const [tick, setTick] = useState(0) // force redraw after resize
  const supabase = useMemo(() => getSupabase(), [])
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
    ;(async () => {
      try {
        const { data: row, error } = await supabase
          .from('boards')
          .select('data')
          .eq('id', 1)
          .single()
        if (!cancelled && row && row.data) {
          const decoded = decodeBoard(row.data as unknown as string)
          if (decoded && decoded.length === size * size) setData(decoded)
        }
        if (error) {
          // ignore: table may not exist yet
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

    // Clear bg
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, w, h)

    // Draw pixels
    const px = Math.max(1, scale)
    for (let y = 0; y < dims.height; y++) {
      for (let x = 0; x < dims.width; x++) {
        const idx = y * dims.width + x
        const colorIndex = data[idx] ?? 0
        const color = palette[colorIndex] ?? '#000'
        const sx = Math.floor(x * px + offset.x)
        const sy = Math.floor(y * px + offset.y)
        if (sx + px < 0 || sy + px < 0 || sx > w || sy > h) continue
        ctx.fillStyle = color
        ctx.fillRect(sx, sy, px, px)
      }
    }

    // Grid lines when zoomed
    if (scale >= 8) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      for (let y = 0; y <= dims.height; y++) {
        const yy = Math.floor(y * scale + offset.y) + 0.5
        if (yy < 0 || yy > h) continue
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke()
      }
      for (let x = 0; x <= dims.width; x++) {
        const xx = Math.floor(x * scale + offset.x) + 0.5
        if (xx < 0 || xx > w) continue
        ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, h); ctx.stroke()
      }
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

  // Handle wheel with a non-passive listener so preventDefault works without warnings
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handler = (ev: WheelEvent) => {
      if (ev.cancelable) ev.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = ev.clientX - rect.left
      const my = ev.clientY - rect.top
      const delta = -Math.sign(ev.deltaY) * 1
      setScale((prev) => {
        const newScale = Math.min(40, Math.max(2, prev + delta))
        const factor = newScale / prev
        setOffset((o) => ({ x: mx - (mx - o.x) * factor, y: my - (my - o.y) * factor }))
        return newScale
      })
    }
    canvas.addEventListener('wheel', handler, { passive: false })
    return () => canvas.removeEventListener('wheel', handler as EventListener)
  }, [])

  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setIsPanning(true)
    setLast({ x: e.clientX, y: e.clientY })
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!isPanning) return
    const dx = e.clientX - last.x
    const dy = e.clientY - last.y
    setLast({ x: e.clientX, y: e.clientY })
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }))
  }
  function onPointerUp() { setIsPanning(false) }

  function canvasToCell(clientX: number, clientY: number) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((clientX - rect.left - offset.x) / scale)
    const y = Math.floor((clientY - rect.top - offset.y) / scale)
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
        () => {},
        () => {}
      )
    }
    setCooldown(5) // seconds
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="opacity-70">zoom</span>
          <span className="font-mono">{scale}x</span>
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
