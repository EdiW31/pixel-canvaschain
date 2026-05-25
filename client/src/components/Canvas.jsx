import { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useCanvas } from '../hooks/useCanvas';
import { useSocket } from '../hooks/useSocket';

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
  const { gridState, selectedColor, refImageSrc, refImageOpacity, refImageRect, wallet, auctionState } = useApp();
  const { socket } = useSocket();
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
    auctionBlockReason,
    CANVAS_SIZE,
  } = useCanvas();

  const displayCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const flashCanvasRef = useRef(null);
  const auctionCanvasRef = useRef(null);
  const auctionFrameRef = useRef(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // Flash effect state (refs to avoid re-renders)
  const flashMapRef = useRef(new Map()); // "x_y" -> timestamp
  const rafRef = useRef(null);
  const offsetRef = useRef(offset);
  const zoomRef = useRef(zoom);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const startFlashLoop = useCallback(() => {
    if (rafRef.current) return;
    const loop = () => {
      const canvas = flashCanvasRef.current;
      const displayCanvas = displayCanvasRef.current;
      if (!canvas || !displayCanvas) { rafRef.current = null; return; }
      const ctx = canvas.getContext('2d');
      canvas.width = displayCanvas.width;
      canvas.height = displayCanvas.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();
      const DURATION = 800;
      let anyActive = false;
      flashMapRef.current.forEach((ts, key) => {
        const age = now - ts;
        if (age >= DURATION) { flashMapRef.current.delete(key); return; }
        anyActive = true;
        const [px, py] = key.split('_').map(Number);
        const alpha = 0.6 * (1 - age / DURATION);
        const { x: ox, y: oy } = offsetRef.current;
        const z = zoomRef.current;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(z, z);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fillRect(px, py, 1, 1);
        ctx.restore();
      });
      rafRef.current = anyActive ? requestAnimationFrame(loop) : null;
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Cleanup rAF on unmount
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Listen for remote pixel updates to trigger flash
  useEffect(() => {
    if (!socket) return;
    const handlePixelUpdate = ({ x, y, address }) => {
      if (address && address === wallet?.address) return;
      flashMapRef.current.set(`${x}_${y}`, Date.now());
      startFlashLoop();
    };
    const handlePixelsUpdate = ({ pixels }) => {
      const toFlash = pixels.slice(0, 8);
      const now = Date.now();
      toFlash.forEach(({ x, y }) => flashMapRef.current.set(`${x}_${y}`, now));
      if (toFlash.length) startFlashLoop();
    };
    socket.on('pixel:update', handlePixelUpdate);
    socket.on('pixels:update', handlePixelsUpdate);
    return () => {
      socket.off('pixel:update', handlePixelUpdate);
      socket.off('pixels:update', handlePixelsUpdate);
    };
  }, [socket, wallet?.address, startFlashLoop]);

  // Preloaded reference image — stored in state so canvas re-renders when it loads.
  const [refImageObj, setRefImageObj] = useState(null);
  useEffect(() => {
    if (!refImageSrc) { setRefImageObj(null); return; }
    const img = new Image();
    img.onload = () => setRefImageObj(img);
    img.src = refImageSrc;
  }, [refImageSrc]);

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

    // Draw reference image overlay at its canvas-pixel rect
    if (refImageObj) {
      ctx.globalAlpha = refImageOpacity;
      ctx.drawImage(refImageObj, refImageRect.x, refImageRect.y, refImageRect.w, refImageRect.h);
      ctx.globalAlpha = 1;
    }

    // Restore context before drawing grid (draw grid in screen space)
    ctx.restore();

    // Draw grid lines at high zoom (in screen space for crisp 1px lines).
    // Soft gray that fades in between zoom 5 → 25 so the grid is never
    // visually loud, just barely readable when you're working close.
    if (shouldShowGrid) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const baseAlpha = Math.min(0.16, Math.max(0.05, (zoom - 5) / 24));
      ctx.strokeStyle = isDark
        ? `rgba(255, 255, 255, ${baseAlpha})`
        : `rgba(40, 40, 40, ${baseAlpha})`;
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
  }, [gridState, zoom, offset, shouldShowGrid, getVisibleArea, refImageObj, refImageOpacity, refImageRect]);

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
        // Check if any pixel under the brush hits a blocked auction zone
        let blocked = false;
        for (let dy = 0; dy < previewHeight && !blocked; dy++) {
          for (let dx = 0; dx < previewWidth && !blocked; dx++) {
            if (auctionBlockReason(previewX + dx, previewY + dy)) blocked = true;
          }
        }

        // Fill: selected color preview, dimmed red when blocked
        ctx.globalAlpha = blocked ? 0.35 : 0.55;
        ctx.fillStyle = blocked ? '#E53E3E' : selectedColor;
        ctx.fillRect(previewX, previewY, previewWidth, previewHeight);
        ctx.globalAlpha = 1;

        // Outline: subtle dark in normal mode, bold red when blocked
        ctx.strokeStyle = blocked ? '#E53E3E' : 'rgba(0, 0, 0, 0.65)';
        ctx.lineWidth = blocked ? 0.18 : 0.08;
        ctx.strokeRect(previewX, previewY, previewWidth, previewHeight);

        // Subtle white inner outline for visibility on dark pixels
        if (!blocked) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 0.05;
          ctx.strokeRect(previewX + 0.05, previewY + 0.05, previewWidth - 0.1, previewHeight - 0.1);
        }
      }

      ctx.restore();
    }
  }, [hoverPixel, brushSize, selectedColor, zoom, offset, CANVAS_SIZE, auctionBlockReason]);

  /**
   * Render auction zone border on a dedicated overlay canvas.
   * Gold pulsing border during active auction; solid purple after winner is set.
   */
  useEffect(() => {
    const canvas = auctionCanvasRef.current;
    const displayCanvas = displayCanvasRef.current;
    if (!canvas || !displayCanvas) return;

    const rect = displayCanvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!auctionState) return;

    const { active, sectionX, sectionY, endTs, winner } = auctionState;
    const now = Date.now() / 1000; // seconds
    const auctionLive = active && now < endTs;
    const zoneWon = !active && winner && winner !== '';

    if (!auctionLive && !zoneWon) return;

    const ZONE = 20;

    /**
     * Draw the full auction zone: dark overlay + animated border + text.
     * @param {number} borderAlpha  0–1, pulsed for live auctions
     */
    const drawZone = (borderAlpha) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ── World-space pass ─────────────────────────────────────────────
      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);

      if (auctionLive) {
        // Live auction: gold fill + animated gold border (existing behavior)
        ctx.fillStyle = 'rgba(229, 181, 71, 0.28)';
        ctx.fillRect(sectionX, sectionY, ZONE, ZONE);

        ctx.strokeStyle = `rgba(255, 200, 0, ${borderAlpha})`;
        ctx.lineWidth = 4 / zoom;
        ctx.strokeRect(sectionX + 0.5 / zoom, sectionY + 0.5 / zoom, ZONE, ZONE);
      } else if (zoneWon) {
        // Zone won: margin only — NO fill (so the winner's painted pixels
        // remain fully visible), NO lock icon, NO "AUCTION ZONE" label.
        ctx.strokeStyle = 'rgba(160, 80, 255, 1.0)';
        ctx.lineWidth = 3 / zoom;
        ctx.strokeRect(sectionX, sectionY, ZONE, ZONE);

        // Gold L-shaped corner ticks for emphasis
        const tick = 3;
        ctx.lineWidth = 5 / zoom;
        ctx.strokeStyle = 'rgba(229, 181, 71, 1.0)';
        const corners = [
          [0,    0,     1,  1],
          [ZONE, 0,    -1,  1],
          [0,    ZONE,  1, -1],
          [ZONE, ZONE, -1, -1],
        ];
        for (const [dx, dy, sxDir, syDir] of corners) {
          ctx.beginPath();
          ctx.moveTo(sectionX + dx + tick * sxDir, sectionY + dy);
          ctx.lineTo(sectionX + dx, sectionY + dy);
          ctx.lineTo(sectionX + dx, sectionY + dy + tick * syDir);
          ctx.stroke();
        }
      }

      ctx.restore();

      // ── Screen-space pass: lock icon + labels ────────────────────────
      // ONLY rendered during the live auction. Once the zone is won, the
      // winner's artwork lives inside that frame — no lock, no label.
      if (!auctionLive) return;

      const zoneScreenW = ZONE * zoom;
      if (zoneScreenW < 64) return;

      const cx = offset.x + (sectionX + ZONE / 2) * zoom;
      const cy = offset.y + (sectionY + ZONE / 2) * zoom;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lockPx = Math.min(Math.max(zoneScreenW * 0.22, 14), 40);
      ctx.font = `${lockPx}px serif`;
      ctx.fillText('🔒', cx, cy - zoneScreenW * 0.09);

      const labelPx = Math.min(Math.max(zoneScreenW * 0.10, 8), 14);
      if (labelPx >= 8) {
        ctx.font = `bold ${labelPx}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.93)';
        ctx.fillText('AUCTION ZONE', cx, cy + zoneScreenW * 0.12);
      }

      const dimPx = Math.min(Math.max(zoneScreenW * 0.075, 6), 11);
      if (dimPx >= 6) {
        ctx.font = `${dimPx}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
        ctx.fillText(`${ZONE} × ${ZONE} px`, cx, cy + zoneScreenW * 0.24);
      }

      ctx.restore();
    };

    if (auctionLive) {
      let running = true;
      const animate = () => {
        if (!running) return;
        auctionFrameRef.current += 1;
        const alpha = 0.45 + 0.55 * Math.abs(Math.sin(auctionFrameRef.current * 0.04));
        drawZone(alpha);
        requestAnimationFrame(animate);
      };
      const rafId = requestAnimationFrame(animate);
      return () => { running = false; cancelAnimationFrame(rafId); };
    } else {
      drawZone(0.90);
    }
  }, [auctionState, zoom, offset]);

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
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 50% 40%, rgb(var(--background-alt)) 0%, rgb(var(--background)) 70%)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.08), inset 0 0 0 1px rgb(var(--border))',
      }}
    >
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

      {/* Flash overlay canvas (remote pixel highlights) */}
      <canvas
        ref={flashCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Auction zone border overlay */}
      <canvas
        ref={auctionCanvasRef}
        className="absolute inset-0 pointer-events-none"
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
