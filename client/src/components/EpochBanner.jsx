import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

function formatCountdown(msLeft) {
  if (msLeft <= 0) return 'ending…';
  const s = Math.floor(msLeft / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}

// ── Pixel art mascot (8 × 11) ────────────────────────────────────────────────
const T=null, G='#E5B547', GD='#C49628', SK='#FDE68A', EY='#1A1817', RD='#E05A4B', BL='#3B82F6', BK='#1A1817';
const MASCOT = [
  [T,  T,  GD, GD, GD, GD, T,  T ],
  [T,  GD, G,  G,  G,  G,  GD, T ],
  [T,  T,  SK, SK, SK, SK, T,  T ],
  [T,  T,  SK, EY, SK, EY, SK, T ],
  [T,  T,  SK, SK, SK, SK, T,  T ],
  [SK, RD, RD, RD, RD, RD, RD, SK],
  [T,  RD, RD, RD, RD, RD, T,  T ],
  [T,  T,  BL, BL, T,  BL, BL, T ],
  [T,  T,  BL, BL, T,  BL, BL, T ],
  [T,  T,  BK, BK, T,  BK, BK, T ],
  [T,  T,  BK, T,  T,  T,  BK, T ],
];

const PX = 3;

const PixelGuy = () => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(8, ${PX}px)`,
      gridTemplateRows: `repeat(11, ${PX}px)`,
      imageRendering: 'pixelated',
      flexShrink: 0,
      willChange: 'transform',
    }}
  >
    {MASCOT.flat().map((color, i) => (
      <div key={i} style={{ width: PX, height: PX, backgroundColor: color ?? 'transparent' }} />
    ))}
  </div>
);

// ── Banner ────────────────────────────────────────────────────────────────────
const EpochBanner = ({ className = '' }) => {
  const { epochInfo } = useApp();
  const [msLeft, setMsLeft] = useState(0);

  useEffect(() => {
    if (!epochInfo.endsAt) { setMsLeft(0); return; }
    const tick = () => setMsLeft(Math.max(0, epochInfo.endsAt - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [epochInfo.endsAt]);

  if (!epochInfo.epoch) return null;

  const epochEnded = epochInfo.endsAt > 0 && msLeft <= 0;

  return (
    <>
      <style>{`
        @keyframes mascot-float {
          0%,100% { transform: translateY(0px);   }
          50%      { transform: translateY(-3px);  }
        }
      `}</style>

      <div
        className={`inline-flex items-center gap-2 select-none ${className}`}
        style={epochEnded ? {
          padding: '5px 12px 5px 7px',
          borderRadius: 999,
          background: 'rgb(var(--primary))',
          border: '1px solid rgba(196,150,40,0.40)',
          boxShadow: '0 2px 8px rgba(229,181,71,0.25)',
          transition: 'box-shadow 0.3s ease',
          opacity: 0.6,
        } : {
          padding: '5px 12px 5px 7px',
          borderRadius: 999,
          background: 'rgb(var(--primary))',
          border: '1px solid rgba(196,150,40,0.40)',
          boxShadow: '0 2px 10px rgba(229,181,71,0.30)',
          transition: 'box-shadow 0.3s ease',
        }}
      >
        {/* Mascot with gentle float */}
        <div
          style={{
            display: 'flex', alignItems: 'flex-end',
            height: 33, flexShrink: 0,
            animation: 'mascot-float 2.8s ease-in-out infinite',
            willChange: 'transform',
            opacity: epochEnded ? 0.5 : 1,
          }}
        >
          <PixelGuy />
        </div>

        {/* Thin divider */}
        <div style={{ width: 1, height: 18, background: 'rgba(27,26,23,0.20)', flexShrink: 0 }} />

        {/* Text */}
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          {epochEnded ? (
            <>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(27,26,23,0.60)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                Epoch {epochInfo.epoch} ended
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1B1A17', letterSpacing: '-0.01em' }}>
                Waiting for Epoch {epochInfo.epoch + 1}
                <span style={{ fontWeight: 400, color: 'rgba(27,26,23,0.55)', marginLeft: 4, fontSize: 11 }}>to start</span>
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(27,26,23,0.60)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                Epoch {epochInfo.epoch}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1B1A17', letterSpacing: '-0.01em' }}>
                is live
                {epochInfo.endsAt > 0 && (
                  <span style={{ fontFamily: 'monospace', fontWeight: 400, color: 'rgba(27,26,23,0.55)', marginLeft: 6, fontSize: 11 }}>
                    · {formatCountdown(msLeft)}
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        {/* Live dot (hidden when ended) */}
        {!epochEnded && (
          <span style={{ position: 'relative', display: 'flex', height: 7, width: 7, flexShrink: 0 }}>
            <span
              className="animate-ping"
              style={{
                position: 'absolute', inset: 0,
                borderRadius: '50%',
                background: '#1B1A17', opacity: 0.40,
              }}
            />
            <span style={{ position: 'relative', borderRadius: '50%', height: 7, width: 7, background: '#1B1A17', display: 'block' }} />
          </span>
        )}
      </div>
    </>
  );
};

export default EpochBanner;
