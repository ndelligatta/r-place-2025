type Props = {
  colors: string[]
  selected: number
  onSelect: (idx: number) => void
  cooldown?: number
}

export default function Palette({ colors, selected, onSelect, cooldown = 0 }: Props) {
  return (
    <div className="flex flex-col gap-4 h-full min-h-0 relative">
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 overflow-auto pr-1">
        {colors.map((c, i) => {
          const isSelected = i === selected
          const style: React.CSSProperties = { backgroundColor: c }
          const base = 'relative h-16 rounded-md flex items-center justify-center border-8 transform-gpu transition-none select-none shrink-0 overflow-hidden border-transparent'
          const selectedCls = isSelected ? ' border-white' : ''
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              title={c}
              className={`${base}${selectedCls}`}
              style={style}
              data-demo-swatch={isSelected ? 'true' : undefined}
              data-swatch-index={i}
            >
              {isSelected ? (
                <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <svg
                    className="w-full h-full p-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M5 13l4 4L19 7" stroke="black" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {cooldown > 0 ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center p-4 md:p-6"
          style={{
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px) saturate(120%)',
          }}
        >
          <div
            className="text-center neon-pulse"
            style={{
              border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: 16,
              padding: '28px 32px',
              maxWidth: 'min(620px, 100%)',
              width: 'auto',
              minHeight: '180px',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
              boxShadow: '0 0 40px rgba(255,60,247,0.35), 0 0 34px rgba(0,247,255,0.25)'
            }}
          >
            <div className="font-bold ticker-glow" style={{ fontSize: 'clamp(28px, 3.8vw, 48px)' }}>Cooldown Active</div>
            <div className="mt-4" style={{ fontSize: 'clamp(18px, 2.4vw, 26px)' }}>
              Please wait
              <span className="font-mono" style={{ color: 'var(--color-neon-yellow)', marginLeft: 8 }}>
                {cooldown.toFixed(1)}s
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
