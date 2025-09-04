type Props = {
  colors: string[]
  selected: number
  onSelect: (idx: number) => void
  cooldown?: number
}

export default function Palette({ colors, selected, onSelect, cooldown = 0 }: Props) {
  const selectedColor = colors[selected]
  return (
    <div className="flex flex-col gap-4 h-full min-h-0 relative">
      <div className="rounded-md p-3 neon-border" style={{ borderColor: 'var(--color-neon-cyan)' }}>
        <div className="flex items-center justify-between text-xs">
          <span className="opacity-80">Selected</span>
          <span className="font-mono" style={{ color: 'var(--color-neon-yellow)' }}>{selectedColor}</span>
        </div>
        <div className="mt-2 h-10 rounded-sm" style={{ background: selectedColor }} />
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 overflow-auto pr-1">
        {colors.map((c, i) => {
          const isSelected = i === selected
          const style: React.CSSProperties = {
            backgroundColor: c,
            borderColor: 'rgba(255,255,255,0.12)',
            boxShadow: isSelected ? '0 0 0 2px var(--color-neon-cyan), 0 0 18px rgba(0,247,255,0.45)' : '0 0 0 1px rgba(255,255,255,0.08) inset',
          }
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              title={c}
              className="relative h-20 rounded-md transition-transform active:scale-95 flex items-center justify-center"
              style={style}
            >
              {/* Pure color swatch; coin logos removed */}
            </button>
          )
        })}
      </div>

      {cooldown > 0 ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center p-6"
          style={{
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            className="text-center"
            style={{
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 12,
              padding: '18px 22px',
              boxShadow: '0 0 24px rgba(255,60,247,0.35), 0 0 24px rgba(0,247,255,0.25)'
            }}
          >
            <div className="text-lg md:text-2xl font-bold ticker-glow">Cooldown Active</div>
            <div className="mt-2 text-sm md:text-base">
              Please wait{' '}
              <span className="font-mono" style={{ color: 'var(--color-neon-yellow)' }}>{cooldown.toFixed(1)}s</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
