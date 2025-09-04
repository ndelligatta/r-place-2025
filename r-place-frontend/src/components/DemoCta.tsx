import { useEffect, useState } from 'react'

export default function DemoCta() {
  const [done, setDone] = useState(() => {
    try { return localStorage.getItem('rplace_demo_v1') === 'done' } catch { return false }
  })

  useEffect(() => {
    const id = setInterval(() => {
      try { setDone(localStorage.getItem('rplace_demo_v1') === 'done') } catch {}
    }, 1000)
    return () => clearInterval(id)
  }, [])

  function play() {
    try { localStorage.removeItem('rplace_demo_v1') } catch {}
    window.dispatchEvent(new Event('rplace:demo:play'))
  }

  function openHelp() {
    window.dispatchEvent(new Event('rplace:help:open'))
  }

  return (
    <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 35, display: 'flex', gap: 8 }}>
      <button
        className={done ? 'btn-neon' : 'btn-neon neon-pulse'}
        onClick={play}
        style={done ? { borderRadius: 9999, width: 44, height: 44, padding: 0 } : { padding: '10px 14px', fontSize: 14, fontWeight: 700, borderWidth: 2 }}
        aria-label={done ? 'Replay 4s demo' : 'Watch 4s demo'}
        title={done ? 'Replay demo' : 'Watch 4s demo'}
      >
        {done ? '⟳' : '▶ Watch 4s Demo'}
      </button>
      <button
        className="btn-neon"
        onClick={openHelp}
        aria-label="How to play"
        title="How to play"
        style={{ borderRadius: 9999, width: 44, height: 44, padding: 0, fontWeight: 900 }}
      >
        ?
      </button>
    </div>
  )
}
