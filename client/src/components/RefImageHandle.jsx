import { useApp } from '../context/AppContext';

// RefImageHandle — DOM overlay for dragging/resizing the reference image.
// Position/size are in canvas-pixel coords (0–100); mouse deltas are divided by
// `zoom` to stay aligned. When locked, pointer-events:none lets all mouse events
// fall through to the canvas.

const MIN_PX = 2;
const clampMin = (v) => Math.max(MIN_PX, v);

const RefImageHandle = () => {
  const {
    refImageSrc, refImageRect, setRefImageRect,
    refImageLocked, zoom, offset,
  } = useApp();

  if (!refImageSrc) return null;

  // Convert canvas-pixel rect → screen-pixel rect (relative to canvas container)
  const sx = refImageRect.x * zoom + offset.x;
  const sy = refImageRect.y * zoom + offset.y;
  const sw = refImageRect.w * zoom;
  const sh = refImageRect.h * zoom;

  // Locked: render nothing interactive — canvas handles everything.
  if (refImageLocked) return null;

  // Drag whole image
  const onDragStart = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startMX = e.clientX, startMY = e.clientY;
    const start = { ...refImageRect };

    const onMove = (ev) => {
      setRefImageRect({
        ...start,
        x: start.x + (ev.clientX - startMX) / zoom,
        y: start.y + (ev.clientY - startMY) / zoom,
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Resize from any of the 8 directions
  const onResizeStart = (dir) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startMX = e.clientX, startMY = e.clientY;
    const start = { ...refImageRect };

    const onMove = (ev) => {
      const dx = (ev.clientX - startMX) / zoom;
      const dy = (ev.clientY - startMY) / zoom;
      let { x, y, w, h } = start;

      if (dir.includes('e')) w = clampMin(w + dx);
      if (dir.includes('s')) h = clampMin(h + dy);
      if (dir.includes('w')) { w = clampMin(w - dx); x = start.x + (start.w - w); }
      if (dir.includes('n')) { h = clampMin(h - dy); y = start.y + (start.h - h); }

      setRefImageRect({ x, y, w, h });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const H = 8;

  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{ left: sx, top: sy, width: sw, height: sh }}
    >
      <div
        className="absolute inset-0"
        style={{ border: '1.5px dashed rgba(229,181,71,0.8)', borderRadius: 2, pointerEvents: 'none' }}
      />

      {/* Drag area — interior excluding handle strip */}
      <div
        className="absolute pointer-events-auto cursor-move"
        style={{ inset: H }}
        onMouseDown={onDragStart}
      />

      <div className="absolute pointer-events-auto cursor-n-resize"
        style={{ top: 0, left: H, right: H, height: H }} onMouseDown={onResizeStart('n')} />
      <div className="absolute pointer-events-auto cursor-s-resize"
        style={{ bottom: 0, left: H, right: H, height: H }} onMouseDown={onResizeStart('s')} />
      <div className="absolute pointer-events-auto cursor-w-resize"
        style={{ left: 0, top: H, bottom: H, width: H }} onMouseDown={onResizeStart('w')} />
      <div className="absolute pointer-events-auto cursor-e-resize"
        style={{ right: 0, top: H, bottom: H, width: H }} onMouseDown={onResizeStart('e')} />

      <Corner style={{ top: 0,    left: 0  }} cursor="nw-resize" H={H} onMouseDown={onResizeStart('nw')} />
      <Corner style={{ top: 0,    right: 0 }} cursor="ne-resize" H={H} onMouseDown={onResizeStart('ne')} />
      <Corner style={{ bottom: 0, left: 0  }} cursor="sw-resize" H={H} onMouseDown={onResizeStart('sw')} />
      <Corner style={{ bottom: 0, right: 0 }} cursor="se-resize" H={H} onMouseDown={onResizeStart('se')} />
    </div>
  );
};

const Corner = ({ style, onMouseDown, cursor, H }) => (
  <div
    className="absolute pointer-events-auto"
    style={{
      ...style, width: H, height: H, cursor,
      background: 'rgb(229 181 71)',
      border: '1px solid rgba(0,0,0,0.35)',
      borderRadius: 2,
    }}
    onMouseDown={onMouseDown}
  />
);

export default RefImageHandle;
