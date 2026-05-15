/**
 * PaintDecorations — shared decorative components used across all marketing pages.
 * Keeps the "painty" visual language consistent on Welcome, Login, and Shop.
 */

// Floating paint-drop square (purely decorative, aria-hidden)
export const Dot = ({ color, style }) => (
  <div
    aria-hidden="true"
    style={{
      position: 'absolute',
      width: 10,
      height: 10,
      borderRadius: 2,
      background: color,
      opacity: 0.5,
      pointerEvents: 'none',
      ...style,
    }}
  />
);

// Wavy brush-stroke SVG underline for section headings
export const Stroke = ({ color = 'rgb(var(--primary))' }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 120 10"
    fill="none"
    style={{ width: 80, height: 8, marginTop: 10, marginBottom: 20 }}
  >
    <path
      d="M4 6 Q30 2 60 5 Q90 8 116 4"
      stroke={color}
      strokeWidth="3.5"
      strokeLinecap="round"
    />
  </svg>
);

// A 16×10 mini pixel-art canvas preview grid (hardcoded rainbow swatch)
const MINI_PIXELS = [
  ['#E53E3E','#E53E3E','#ED8936','#ED8936','#ECC94B','#ECC94B','#48BB78','#48BB78','#4299E1','#4299E1','#9F7AEA','#9F7AEA','#ED64A6','#E53E3E','#ED8936','#ECC94B'],
  ['#E53E3E','#1A1817','#ED8936','#1A1817','#ECC94B','#1A1817','#48BB78','#1A1817','#4299E1','#1A1817','#9F7AEA','#1A1817','#ED64A6','#ED64A6','#E53E3E','#ED8936'],
  ['#ED8936','#ED8936','#ECC94B','#ECC94B','#48BB78','#48BB78','#4299E1','#4299E1','#9F7AEA','#9F7AEA','#ED64A6','#ED64A6','#E53E3E','#E53E3E','#ED8936','#ECC94B'],
  ['#ECC94B','#1A1817','#48BB78','#1A1817','#4299E1','#1A1817','#9F7AEA','#1A1817','#ED64A6','#1A1817','#E53E3E','#1A1817','#ED8936','#ED8936','#ECC94B','#48BB78'],
  ['#ECC94B','#ECC94B','#48BB78','#48BB78','#4299E1','#4299E1','#9F7AEA','#9F7AEA','#ED64A6','#ED64A6','#E53E3E','#E53E3E','#ED8936','#ED8936','#ECC94B','#ECC94B'],
  ['#48BB78','#1A1817','#4299E1','#1A1817','#9F7AEA','#1A1817','#ED64A6','#1A1817','#E53E3E','#1A1817','#ED8936','#1A1817','#ECC94B','#ECC94B','#48BB78','#4299E1'],
  ['#48BB78','#48BB78','#4299E1','#4299E1','#9F7AEA','#9F7AEA','#ED64A6','#ED64A6','#E53E3E','#E53E3E','#ED8936','#ED8936','#ECC94B','#ECC94B','#48BB78','#48BB78'],
  ['#4299E1','#1A1817','#9F7AEA','#1A1817','#ED64A6','#1A1817','#E53E3E','#1A1817','#ED8936','#1A1817','#ECC94B','#1A1817','#48BB78','#48BB78','#4299E1','#9F7AEA'],
  ['#4299E1','#4299E1','#9F7AEA','#9F7AEA','#ED64A6','#ED64A6','#E53E3E','#E53E3E','#ED8936','#ED8936','#ECC94B','#ECC94B','#48BB78','#48BB78','#4299E1','#4299E1'],
  ['#9F7AEA','#9F7AEA','#ED64A6','#ED64A6','#E53E3E','#E53E3E','#ED8936','#ED8936','#ECC94B','#ECC94B','#48BB78','#48BB78','#4299E1','#4299E1','#9F7AEA','#9F7AEA'],
];

export const MiniCanvas = ({ maxWidth = 320 }) => (
  <div
    aria-hidden="true"
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(16, 1fr)',
      gap: 2,
      padding: 6,
      background: 'rgb(var(--surface))',
      border: '1px solid rgb(var(--border))',
      borderRadius: 8,
      boxShadow: '0 4px 16px rgb(var(--shadow) / 0.12)',
      maxWidth,
      width: '100%',
    }}
  >
    {MINI_PIXELS.flat().map((color, i) => (
      <div key={i} style={{ width: '100%', aspectRatio: '1', background: color, borderRadius: 1 }} />
    ))}
  </div>
);

// Tiny paint-chip badge (colored dot + label)
export const PaintChip = ({ color, label }) => (
  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-surface text-xs font-medium text-textSecondary">
    <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
    {label}
  </div>
);

// Horizontal palette strip — shows 8 paint-swatch squares in a row
const PALETTE = ['#E53E3E','#ED8936','#ECC94B','#48BB78','#4299E1','#9F7AEA','#ED64A6','#E5B547'];
export const PaletteStrip = ({ size = 10 }) => (
  <div className="flex items-center gap-1" aria-hidden="true">
    {PALETTE.map((c) => (
      <div key={c} style={{ width: size, height: size, borderRadius: 2, background: c, opacity: 0.8 }} />
    ))}
  </div>
);
