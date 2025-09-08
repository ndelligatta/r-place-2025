import { useEffect, useState } from 'react'

type Props = {
  open: boolean
  initialName?: string | null
  onSubmit: (name: string) => void
}

export default function NamePrompt({ open, initialName, onSubmit }: Props) {
  const [name, setName] = useState(initialName || '')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initialName || '')
    setDirty(false)
    setError(null)
  }, [open, initialName])

  function submit() {
    const n = (name || '').trim()
    if (n.length < 2) { setError('name too short'); return }
    if (n.length > 40) { setError('name too long'); return }
    onSubmit(n)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="panel neon-3d glow-magenta w-full max-w-[440px] rounded-xl p-5">
        <div className="mb-3">
          <div className="section-title">Choose your name</div>
        </div>
        <p className="text-sm opacity-80 mb-4">Show up on the canvas. Change anytime.</p>
        <div className="flex items-center gap-3">
          <input
            className="flex-1 bg-transparent border rounded-md px-3 py-2 outline-none"
            style={{ borderColor: 'rgba(255,255,255,0.18)' }}
            placeholder="type your name"
            value={name}
            onChange={(e) => { setDirty(true); setName(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            autoFocus
            maxLength={40}
          />
          <button className="btn-neon neon-pulse" onClick={submit}>Start</button>
        </div>
        {error ? <div className="mt-2 text-xs" style={{ color: 'var(--color-neon-yellow)' }}>{error}</div> : null}
      </div>
    </div>
  )
}

