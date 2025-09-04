import { useEffect, useMemo, useState } from 'react'

type Ticker = { symbol: string; price: number; change: number; color: string }

const STARTERS: Omit<Ticker, 'price' | 'change'>[] = [
  { symbol: '$BONK', color: '#00F7FF' },
  { symbol: '$DOGE', color: '#F9FF00' },
  { symbol: '$DUMP', color: '#FF3CF7' },
  { symbol: '$PUMP', color: '#00FFA3' },
  { symbol: '$PEPE', color: '#9B59B6' },
  { symbol: '$WAGMI', color: '#1E90FF' },
]

function randomPrice() {
  return +(Math.random() * 3 + 0.1).toFixed(4)
}
function randomDelta() {
  const mag = Math.random() * 0.08
  return +(Math.random() > 0.5 ? mag : -mag).toFixed(4)
}

export default function TickerBar() {
  const [tickers, setTickers] = useState<Ticker[]>([])

  useEffect(() => {
    setTickers(
      STARTERS.map((t) => ({ ...t, price: randomPrice(), change: randomDelta() }))
    )
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setTickers((prev) =>
        prev.map((t) => {
          const change = randomDelta()
          let price = +(t.price + change).toFixed(4)
          if (price <= 0) price = randomPrice()
          return { ...t, price, change }
        })
      )
    }, 1500)
    return () => clearInterval(id)
  }, [])

  const loop = useMemo(() => [...tickers, ...tickers], [tickers])

  return (
    <div className="w-full border-b border-white/10 bg-black/40">
      <div className="ticker-track">
        <div className="ticker-content px-4 py-2">
          {loop.map((t, i) => {
            const up = t.change >= 0
            return (
              <div
                key={i}
                className="flex items-center gap-2 text-xs font-mono px-3 py-1 rounded neon-border"
                style={{ borderColor: t.color }}
              >
                <span className="ticker-glow" style={{ color: t.color }}>{t.symbol}</span>
                <span className="opacity-80">{t.price.toFixed(4)}</span>
                <span style={{ color: up ? 'var(--color-neon-green)' : '#f87171' }}>
                  {up ? '▲' : '▼'} {Math.abs(t.change).toFixed(4)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
