import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

function formatCountdown(msLeft) {
  if (msLeft <= 0) return 'ending…';
  const s = Math.floor(msLeft / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

// ── Pixel art mascot ──────────────────────────────────────────────────────────
// 8 cols × 11 rows. null = transparent.
const T = null;
const G  = '#E5B547'; // gold hat
const GD = '#C49628'; // hat shadow
const SK = '#FDE68A'; // skin
const EY = '#1A1817'; // eyes
const RD = '#E05A4B'; // red shirt (painter vibes)
const BL = '#3B82F6'; // blue pants
const BK = '#1A1817'; // boots

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

const PX = 3; // pixel size in px

const PixelGuy = () => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(8, ${PX}px)`,
      gridTemplateRows: `repeat(11, ${PX}px)`,
      imageRendering: 'pixelated',
      flexShrink: 0,
    }}
  >
    {MASCOT.flat().map((color, i) => (
      <div
        key={i}
        style={{
          width: PX,
          height: PX,
          backgroundColor: color ?? 'transparent',
        }}
      />
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

  return (
    <div
      className={`inline-flex items-center gap-2.5 pl-2 pr-3.5 py-1
        rounded-full select-none
        bg-primaryLight border border-primary/60
        shadow-[0_0_14px_rgba(229,181,71,0.3),inset_0_1px_0_rgba(255,255,255,0.4)]
        hover:shadow-[0_0_20px_rgba(229,181,71,0.45)] transition-shadow duration-300
        ${className}`}
    >
      {/* Mascot */}
      <div className="flex items-end" style={{ height: 33, animation: 'pixelman-walk 2.4s ease-in-out infinite' }}>
        <PixelGuy />
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-primary/30 flex-shrink-0" />

      {/* Text block */}
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] font-semibold text-primaryDark/60 uppercase tracking-widest">
          Epoch {epochInfo.epoch}
        </span>
        <span className="text-xs font-bold text-primaryDark tracking-tight">
          is live
          {epochInfo.endsAt > 0 && (
            <span className="font-mono font-normal text-primaryDark/70 ml-1.5 text-[11px]">
              · {formatCountdown(msLeft)}
            </span>
          )}
        </span>
      </div>

      {/* Pulsing dot */}
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primaryDark" />
      </span>
    </div>
  );
};

export default EpochBanner;
