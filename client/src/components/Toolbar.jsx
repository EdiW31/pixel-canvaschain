import { useEffect } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { useApp } from '../context/AppContext';

/**
 * Toolbar — right-side controls for the canvas.
 *
 * Sections:
 *   1. Zoom (in/out + slider + numeric)
 *   2. Brush (size slider + visual preview + cost-per-stroke)
 *   3. Reset view button
 *   4. Live cursor coordinates
 *   5. Keyboard shortcuts hint card
 */

const MIN_BRUSH = 1;
const MAX_BRUSH = 4;

const Toolbar = () => {
  const {
    zoom, hoverPixel, zoomIn, zoomOut, resetView, minZoom, MAX_ZOOM,
  } = useCanvas();

  const { brushSize, setBrushSize, selectedColor } = useApp();
  const brushCost = brushSize * brushSize;

  // Keyboard shortcuts: [/] cycle brush, R reset view, +/- zoom
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case '[': setBrushSize((b) => Math.max(MIN_BRUSH, b - 1)); break;
        case ']': setBrushSize((b) => Math.min(MAX_BRUSH, b + 1)); break;
        case 'r': case 'R': resetView(); break;
        case '+': case '=': zoomIn(); break;
        case '-': case '_': zoomOut(); break;
        default: return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setBrushSize, resetView, zoomIn, zoomOut]);

  return (
    <div className="w-56 card p-4 space-y-5">
      <h3 className="font-heading text-base font-semibold">Tools</h3>

      {/* ─── Zoom ──────────────────────────────────────────────── */}
      <Section label="Zoom">
        <div className="flex items-center gap-2 mb-2">
          <IconBtn onClick={zoomOut} disabled={zoom <= minZoom} title="Zoom out (-)">−</IconBtn>
          <div className="flex-1 text-center font-semibold tabular-nums">
            {zoom.toFixed(1)}<span className="text-textMuted text-xs ml-0.5">×</span>
          </div>
          <IconBtn onClick={zoomIn} disabled={zoom >= MAX_ZOOM} title="Zoom in (+)">+</IconBtn>
        </div>
        <div className="w-full bg-backgroundAlt rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((zoom - minZoom) / (MAX_ZOOM - minZoom)) * 100}%` }}
          />
        </div>
      </Section>

      {/* ─── Brush ─────────────────────────────────────────────── */}
      <Section label="Brush">
        {/* Visual size preview */}
        <div className="flex items-center justify-center mb-3 h-12 bg-backgroundAlt rounded-md">
          <div
            className="rounded-sm border border-borderStrong"
            style={{
              width:  `${brushSize * 8}px`,
              height: `${brushSize * 8}px`,
              backgroundColor: selectedColor,
            }}
          />
        </div>

        {/* Size buttons */}
        <div className="grid grid-cols-4 gap-1 mb-2">
          {[1, 2, 3, 4].map((size) => (
            <button
              key={size}
              onClick={() => setBrushSize(size)}
              className={`py-1.5 rounded-md text-xs font-semibold transition-colors ${
                brushSize === size
                  ? 'bg-primary text-textPrimary border border-primaryDark/40'
                  : 'bg-backgroundAlt text-textSecondary hover:bg-border'
              }`}
              style={brushSize === size ? { color: '#1B1A17' } : {}}
            >
              {size}×{size}
            </button>
          ))}
        </div>

        <p className="text-xs text-textMuted text-center">
          Cost: <span className="text-charityDark font-semibold">{brushCost}</span> credit{brushCost !== 1 ? 's' : ''} / stroke
        </p>
      </Section>

      {/* ─── View ──────────────────────────────────────────────── */}
      <button onClick={resetView} className="btn-secondary w-full text-sm">
        <RecenterIcon /> Reset view
      </button>

      {/* ─── Cursor ────────────────────────────────────────────── */}
      <Section label="Cursor">
        <div className="bg-backgroundAlt rounded-md p-3">
          {hoverPixel ? (
            <div className="space-y-1 font-mono text-sm">
              <Row k="X" v={hoverPixel.x} />
              <Row k="Y" v={hoverPixel.y} />
            </div>
          ) : (
            <p className="text-xs text-textMuted text-center">Hover the canvas</p>
          )}
        </div>
      </Section>

      {/* ─── Shortcuts ─────────────────────────────────────────── */}
      <div className="pt-4 border-t border-border">
        <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">Shortcuts</p>
        <div className="space-y-1 text-xs text-textSecondary">
          <Shortcut keys={['[', ']']} desc="Brush size" />
          <Shortcut keys={['+', '−']} desc="Zoom" />
          <Shortcut keys={['R']}      desc="Reset view" />
        </div>
      </div>
    </div>
  );
};

/* ─── Sub-components ────────────────────────────────────────────────────── */

const Section = ({ label, children }) => (
  <div>
    <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">{label}</p>
    {children}
  </div>
);

const IconBtn = ({ onClick, disabled, title, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="w-8 h-8 rounded-md border border-border text-textPrimary hover:bg-backgroundAlt disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium text-base flex items-center justify-center"
  >
    {children}
  </button>
);

const Row = ({ k, v }) => (
  <div className="flex justify-between">
    <span className="text-textMuted">{k}</span>
    <span className="text-textPrimary font-semibold tabular-nums">{v}</span>
  </div>
);

const Shortcut = ({ keys, desc }) => (
  <div className="flex items-center justify-between">
    <span>{desc}</span>
    <span className="flex items-center gap-1">
      {keys.map((k, i) => (
        <kbd key={i} className="px-1.5 py-0.5 bg-backgroundAlt border border-border rounded text-[10px] font-mono">
          {k}
        </kbd>
      ))}
    </span>
  </div>
);

const RecenterIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default Toolbar;
