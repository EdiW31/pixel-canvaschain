import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useCanvas } from '../hooks/useCanvas';

/**
 * Canvas - Main 100x100 pixel canvas component
 *
 * Features:
 * - Renders visible portion of 100x100 grid (optimized)
 * - Zoom: Initial fit to 20x (mouse wheel)
 * - Pan: Click & drag (middle/right mouse button)
 * - Paint: Left click + drag (supports brush sizes 1-4)
 * - Grid overlay at high zoom (>5x)
 * - Brush preview on separate overlay canvas
 */

const Canvas = () => {
  const { gridState, selectedColor } = useApp();
  const {
    zoom,
    offset,
    hoverPixel,
    canvasRef,
    shouldShowGrid,
    brushSize,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    centerCanvas,
    getVisibleArea,
    CANVAS_SIZE,
  } = useCanvas();

  const displayCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Center canvas on initial load
   */
  useEffect(() => {
    if (!displayCanvasRef.current || !gridState || isInitialized) return;

    const rect = displayCanvasRef.current.getBoundingClientRect();
    centerCanvas(rect.width, rect.height);
    setIsInitialized(true);
  }, [gridState, centerCanvas, isInitialized]);

  /**
   * Render main canvas (pixels and grid)
   */
  useEffect(() => {
    if (!displayCanvasRef.current || !gridState) return;

    const canvas = displayCanvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size to match container
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply camera transform (zoom and pan)
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Get visible area for optimization
    const { startX, startY, endX, endY } = getVisibleArea();

    // Render visible pixels
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const color = gridState[y]?.[x] || '#FFFFFF';
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Restore context before drawing grid (draw grid in screen space)
    ctx.restore();

    // Draw grid lines at high zoom (in screen space for crisp 1px lines)
    if (shouldShowGrid) {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
      ctx.lineWidth = 1;

      // Calculate screen coordinates for grid lines
      const gridStartX = Math.floor(offset.x + startX * zoom);
      const gridStartY = Math.floor(offset.y + startY * zoom);
      const gridEndX = Math.ceil(offset.x + endX * zoom);
      const gridEndY = Math.ceil(offset.y + endY * zoom);

      // Vertical lines
      for (let x = startX; x <= endX; x++) {
        const screenX = Math.floor(offset.x + x * zoom) + 0.5; // +0.5 for crisp lines
        ctx.beginPath();
        ctx.moveTo(screenX, gridStartY);
        ctx.lineTo(screenX, gridEndY);
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = startY; y <= endY; y++) {
        const screenY = Math.floor(offset.y + y * zoom) + 0.5; // +0.5 for crisp lines
        ctx.beginPath();
        ctx.moveTo(gridStartX, screenY);
        ctx.lineTo(gridEndX, screenY);
        ctx.stroke();
      }
    }
  }, [gridState, zoom, offset, shouldShowGrid, getVisibleArea]);

  /**
   * Render brush preview on separate overlay canvas (reduces full redraws)
   */
  useEffect(() => {
    if (!previewCanvasRef.current || !displayCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');

    // Match size with main canvas
    const rect = displayCanvasRef.current.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear preview canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw brush preview on hover
    if (hoverPixel) {
      ctx.save();

      // Apply same camera transform
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);

      // Calculate brush preview bounds (clamped to canvas)
      const previewX = hoverPixel.x;
      const previewY = hoverPixel.y;
      const previewWidth = Math.min(brushSize, CANVAS_SIZE - previewX);
      const previewHeight = Math.min(brushSize, CANVAS_SIZE - previewY);

      if (previewWidth > 0 && previewHeight > 0) {
        // Draw semi-transparent fill with selected color
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = selectedColor;
        ctx.fillRect(previewX, previewY, previewWidth, previewHeight);
        ctx.globalAlpha = 1;

        // Draw outline
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 0.1;
        ctx.strokeRect(previewX, previewY, previewWidth, previewHeight);
      }

      ctx.restore();
    }
  }, [hoverPixel, brushSize, selectedColor, zoom, offset, CANVAS_SIZE]);

  // Disable context menu on right click
  useEffect(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;

    const handleContextMenu = (e) => e.preventDefault();
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-background overflow-hidden">
      {/* Main pixel canvas */}
      <canvas
        ref={(el) => {
          displayCanvasRef.current = el;
          canvasRef.current = el;
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="w-full h-full cursor-crosshair"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Preview overlay canvas (separate for performance) */}
      <canvas
        ref={previewCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Hover coordinates */}
      {hoverPixel && (
        <div className="absolute top-4 left-4 card px-3 py-1.5 pointer-events-none">
          <p className="text-xs font-mono text-textSecondary">
            ({hoverPixel.x}, {hoverPixel.y})
          </p>
        </div>
      )}

      {/* Zoom level */}
      <div className="absolute top-4 right-4 card px-3 py-1.5 pointer-events-none">
        <p className="text-xs font-mono text-textSecondary">{zoom.toFixed(1)}×</p>
      </div>

      {/* Loading State */}
      {!gridState && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="w-10 h-10 border-[3px] border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-textSecondary text-sm">Loading canvas…</p>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 card px-4 py-3 text-xs text-textSecondary space-y-1.5">
        <p><span className="text-textPrimary font-semibold">Left + drag</span> &mdash; paint</p>
        <p><span className="text-textPrimary font-semibold">Right + drag</span> &mdash; pan</p>
        <p><span className="text-textPrimary font-semibold">Scroll</span> &mdash; zoom</p>
      </div>

      {/* First-visit keyboard shortcuts hint (dismissable, remembered) */}
      <KeyboardHint />
    </div>
  );
};

const HINT_DISMISS_KEY = 'canvaschain-kbd-hint-dismissed';

const KeyboardHint = () => {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(HINT_DISMISS_KEY) !== '1';
  });

  if (!show) return null;

  const dismiss = () => {
    try { window.localStorage.setItem(HINT_DISMISS_KEY, '1'); } catch (_) {}
    setShow(false);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-md w-[90%] sm:w-auto animate-slide-up">
      <div className="card px-4 py-3 shadow-elevate flex items-center gap-3">
        <div className="text-lg flex-shrink-0">⌨️</div>
        <div className="flex-1 text-xs sm:text-sm text-textSecondary leading-snug">
          <span className="text-textPrimary font-semibold">Keyboard shortcuts:</span>{' '}
          <Kbd>[</Kbd> <Kbd>]</Kbd> brush ·{' '}
          <Kbd>+</Kbd> <Kbd>−</Kbd> zoom ·{' '}
          <Kbd>R</Kbd> reset view
        </div>
        <button
          onClick={dismiss}
          className="text-textMuted hover:text-textPrimary text-lg leading-none px-1"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
};

const Kbd = ({ children }) => (
  <kbd className="inline-block px-1.5 py-0.5 bg-backgroundAlt border border-border rounded text-[10px] font-mono text-textPrimary">
    {children}
  </kbd>
);

export default Canvas;
