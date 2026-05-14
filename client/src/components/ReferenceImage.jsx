import { useState, useRef, useEffect } from 'react';

/**
 * ReferenceImage — drop in an inspiration photo while painting.
 *
 * - Stored ONLY in component state → cleared on refresh (by design)
 * - Draggable floating window over the canvas
 * - Adjustable opacity slider so the image can be ghosted as a stencil
 * - Click ✕ to remove
 *
 * Render this inside any positioned (relative/absolute) parent — the overlay
 * positions itself with `position: absolute`.
 */

const DEFAULT_SIZE = { w: 260, h: 260 };
const DEFAULT_POS  = { x: 24,  y: 64  };
const MIN_SIZE = 120;
const MAX_SIZE = 720;

const ReferenceImage = () => {
  const [imageSrc, setImageSrc] = useState(null);
  const [imageName, setImageName] = useState('');
  const [pos, setPos] = useState(DEFAULT_POS);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [opacity, setOpacity] = useState(0.7);
  const [collapsed, setCollapsed] = useState(false);

  // ─── File pick ──────────────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('Image too large (max 8 MB). It only needs to be readable for inspiration.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageSrc(ev.target.result);
      setImageName(file.name);
      setPos(DEFAULT_POS);
      setSize(DEFAULT_SIZE);
      setCollapsed(false);
    };
    reader.readAsDataURL(file);
    // Reset the input value so picking the same file twice still fires onChange.
    e.target.value = '';
  };

  // ─── Drag (header) ──────────────────────────────────────────────────
  const dragRef = useRef(null);
  const onDragStart = (e) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startPos = pos;
    const onMove = (ev) => {
      setPos({ x: startPos.x + (ev.clientX - startX), y: startPos.y + (ev.clientY - startY) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  };

  // ─── Resize (bottom-right corner) ───────────────────────────────────
  const onResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startSize = size;
    const onMove = (ev) => {
      setSize({
        w: Math.max(MIN_SIZE, Math.min(MAX_SIZE, startSize.w + (ev.clientX - startX))),
        h: Math.max(MIN_SIZE, Math.min(MAX_SIZE, startSize.h + (ev.clientY - startY))),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  };

  // ─── Render: upload button when empty ───────────────────────────────
  if (!imageSrc) {
    return (
      <label
        className="absolute top-4 right-1/2 translate-x-1/2 z-30 card px-3 py-2 cursor-pointer hover:bg-backgroundAlt transition-colors flex items-center gap-2 text-sm text-textSecondary hover:text-textPrimary"
        title="Drop an image you want to copy. It stays only in your browser session."
      >
        <CameraIcon />
        <span>Upload reference</span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFile}
        />
      </label>
    );
  }

  // ─── Render: floating window ────────────────────────────────────────
  return (
    <div
      ref={dragRef}
      className="absolute card shadow-elevate overflow-hidden z-30 select-none"
      style={{
        left:   `${pos.x}px`,
        top:    `${pos.y}px`,
        width:  `${size.w}px`,
        height: collapsed ? 'auto' : `${size.h}px`,
      }}
    >
      {/* Header / drag handle */}
      <div
        onMouseDown={onDragStart}
        className="px-3 py-2 bg-backgroundAlt border-b border-border flex items-center gap-2 cursor-move"
      >
        <CameraIcon className="text-textMuted" />
        <span className="text-xs font-medium text-textSecondary truncate flex-1">
          {imageName || 'Reference'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
          className="text-textMuted hover:text-textPrimary text-xs px-1"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▾' : '▴'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setImageSrc(null); }}
          className="text-textMuted hover:text-error text-base leading-none px-1"
          title="Remove reference"
        >
          ×
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Image */}
          <div
            className="bg-backgroundAlt"
            style={{
              height: `calc(100% - 64px)`,
              backgroundImage: `
                linear-gradient(45deg, rgb(var(--border)) 25%, transparent 25%),
                linear-gradient(-45deg, rgb(var(--border)) 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, rgb(var(--border)) 75%),
                linear-gradient(-45deg, transparent 75%, rgb(var(--border)) 75%)
              `,
              backgroundSize: '12px 12px',
              backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
            }}
          >
            <img
              src={imageSrc}
              alt="reference"
              className="w-full h-full object-contain pointer-events-none"
              style={{ opacity }}
              draggable={false}
            />
          </div>

          {/* Opacity slider */}
          <div className="px-3 py-2 border-t border-border bg-surface flex items-center gap-2">
            <span className="text-[10px] text-textMuted">Opacity</span>
            <input
              type="range"
              min="10" max="100"
              value={Math.round(opacity * 100)}
              onChange={(e) => setOpacity(Number(e.target.value) / 100)}
              className="flex-1 h-1 accent-primary"
            />
            <span className="text-[10px] text-textSecondary tabular-nums w-8 text-right">
              {Math.round(opacity * 100)}%
            </span>
          </div>

          {/* Resize handle (bottom-right corner) */}
          <div
            onMouseDown={onResizeStart}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
            style={{
              background: `linear-gradient(135deg, transparent 50%, rgb(var(--text-muted) / 0.6) 50%, rgb(var(--text-muted) / 0.6) 65%, transparent 65%)`,
            }}
            title="Drag to resize"
          />
        </>
      )}
    </div>
  );
};

const CameraIcon = ({ className = '' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export default ReferenceImage;
