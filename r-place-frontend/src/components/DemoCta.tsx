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

  return (
    <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 35 }}>
      {done ? (
        <button
          aria-label="Replay 4s demo"
          className="btn-neon"
          onClick={play}
          style={{ borderRadius: 9999, width: 44, height: 44, padding: 0 }}
          title="Replay demo"
        >
          ⟳
        </button>
      ) : (
        <button
          className="btn-neon neon-pulse"
          onClick={play}
          style={{
            padding: '10px 14px',
            fontSize: 14,
            fontWeight: 700,
            borderWidth: 2,
          }}
        >
          ▶ Watch 4s Demo
        </button>
      )}
    </div>
  )
}

