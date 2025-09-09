import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '../lib/supabaseClient'

type EventMsg = { text: string; color?: string }

export default function TickerBar() {
  const supabase = getSupabase()
  const [msgs, setMsgs] = useState<EventMsg[]>([{ text: 'welcome to r/place 2025', color: '#00F7FF' }])
  const chRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)

  useEffect(() => {
    if (!supabase) return
    const ch = supabase
      .channel('board-1', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'pixel' }, (payload: any) => {
        const p = payload?.payload as { owner?: string | null }
        const name = (p?.owner || 'anonymous').toString()
        const text = `${name.toLowerCase()} placed a pixel!`
        setMsgs((prev) => {
          const next = [...prev, { text }]
          return next.slice(-25) // keep last 25
        })
      })
      .on('broadcast', { event: 'image' }, (payload: any) => {
        const p = payload?.payload as { owner?: string | null }
        const name = (p?.owner || 'anonymous').toString()
        const text = `${name.toLowerCase()} placed a pixel!`
        setMsgs((prev) => {
          const next = [...prev, { text }]
          return next.slice(-25)
        })
      })
      .subscribe()
    chRef.current = ch
    return () => {
      if (chRef.current && supabase) supabase.removeChannel(chRef.current)
      chRef.current = null
    }
  }, [!!supabase])

  const loop = useMemo(() => msgs.length ? [...msgs, ...msgs] : msgs, [msgs])

  return (
    <div className="w-full border-b border-white/10 bg-black/40">
      <div className="ticker-track">
        <div className="ticker-content px-4 py-2">
          {loop.map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs font-mono px-3 py-1 rounded neon-border"
              style={{ borderColor: m.color || 'var(--color-neon-cyan)' }}
            >
              <span className="ticker-glow" style={{ color: m.color || 'var(--color-neon-cyan)' }}>{m.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
