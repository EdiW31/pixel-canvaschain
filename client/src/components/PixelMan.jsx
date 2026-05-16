// Reusable pixel-art mascot. Size, tilt, and shadow are configurable via props.

const X=null, G='#E5B547', GD='#C49628', SK='#FDE68A', EY='#1A1817', RD='#E05A4B', BL='#3B82F6', BK='#1A1817';
const MASCOT = [
  [X,  X,  GD, GD, GD, GD, X,  X ],
  [X,  GD, G,  G,  G,  G,  GD, X ],
  [X,  X,  SK, SK, SK, SK, X,  X ],
  [X,  X,  SK, EY, SK, EY, SK, X ],
  [X,  X,  SK, SK, SK, SK, X,  X ],
  [SK, RD, RD, RD, RD, RD, RD, SK],
  [X,  RD, RD, RD, RD, RD, X,  X ],
  [X,  X,  BL, BL, X,  BL, BL, X ],
  [X,  X,  BL, BL, X,  BL, BL, X ],
  [X,  X,  BK, BK, X,  X,  BK, X ],
  [X,  X,  BK, X,  X,  X,  BK, X ],
];

const PixelMan = ({ px = 7, tilt = 0, animateBounce = false, className = '', style = {} }) => (
  <div
    className={className}
    style={{
      transform: tilt ? `rotate(${tilt}deg)` : undefined,
      ...style,
    }}
  >
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(8, ${px}px)`,
        gridTemplateRows: `repeat(11, ${px}px)`,
        imageRendering: 'pixelated',
        flexShrink: 0,
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))',
        animation: animateBounce ? 'pixelman-bob 3s ease-in-out infinite' : undefined,
      }}
    >
      {MASCOT.flat().map((color, i) => (
        <div key={i} style={{ width: px, height: px, backgroundColor: color ?? 'transparent' }} />
      ))}
    </div>
  </div>
);

export default PixelMan;
