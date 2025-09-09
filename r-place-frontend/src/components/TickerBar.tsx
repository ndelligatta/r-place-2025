import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '../lib/supabaseClient'

type EventMsg = { text: string; color?: string }

export default function TickerBar() {
  const supabase = getSupabase()
  const [msgs, setMsgs] = useState<EventMsg[]>([])
  const chRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const BOARD_ID = 2

  // Seed with recent placements from the database
  useEffect(() => {
    let aborted = false
    ;(async () => {
      if (!supabase) return
      try {
        const { data } = await (supabase as any)
          .from('pixel_owners')
          .select('owner, updated_at')
          .eq('board_id', BOARD_ID)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .limit(25)
        if (!aborted && Array.isArray(data)) {
          const initial = data
            .filter((r: any) => r?.owner)
            .map((r: any) => ({ text: `${String(r.owner).toLowerCase()} placed a pixel!` }))
            .reverse() // oldest first in ticker
          setMsgs(initial)
        }
      } catch {}
    })()
    return () => { aborted = true }
  }, [!!supabase])

  // Realtime: listen to db changes on pixel_owners and to broadcast events
  useEffect(() => {
    if (!supabase) return
    const ch = supabase
      .channel('pixel-feed', { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pixel_owners', filter: `board_id=eq.${BOARD_ID}` }, (payload: any) => {
        const owner = (payload?.new?.owner || payload?.old?.owner || 'anonymous') as string
        if (!owner) return
        const text = `${owner.toLowerCase()} placed a pixel!`
        setMsgs((prev) => [...prev.slice(-24), { text }])
      })
      .on('broadcast', { event: 'pixel' }, (payload: any) => {
        const p = payload?.payload as { owner?: string | null }
        const name = (p?.owner || 'anonymous').toString()
        const text = `${name.toLowerCase()} placed a pixel!`
        setMsgs((prev) => [...prev.slice(-24), { text }])
      })
      .on('broadcast', { event: 'image' }, (payload: any) => {
        const p = payload?.payload as { owner?: string | null }
        const name = (p?.owner || 'anonymous').toString()
        const text = `${name.toLowerCase()} placed a pixel!`
        setMsgs((prev) => [...prev.slice(-24), { text }])
      })
      .subscribe()
    chRef.current = ch
    return () => {
      if (chRef.current && supabase) supabase.removeChannel(chRef.current)
      chRef.current = null
    }
  }, [!!supabase])

  const loop = useMemo(() => (msgs.length ? [...msgs, ...msgs] : msgs), [msgs])

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
