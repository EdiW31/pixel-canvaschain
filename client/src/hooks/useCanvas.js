import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useSocket } from './useSocket';

/**
 * useCanvas - Canvas interaction hook
 *
 * Manages:
 * - Zoom (1x to 20x)
 * - Pan (click & drag)
 * - Pixel painting (single and brush)
 * - Hover coordinates
 * - Grid rendering
 * - Brush preview
 */

const CANVAS_SIZE = 100; // 100x100 pixels (matches server)
const MIN_ZOOM = 1;
const MAX_ZOOM = 20;

/**
 * Calculate all pixels in brush area (anchor at top-left)
 */
function getBrushPixels(x, y, brushSize, color, canvasSize = CANVAS_SIZE) {
  const pixels = [];
  for (let dy = 0; dy < brushSize; dy++) {
    for (let dx = 0; dx < brushSize; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px >= 0 && px < canvasSize && py >= 0 && py < canvasSize) {
        pixels.push({ x: px, y: py, color });
      }
    }
  }
  return pixels;
}

export const useCanvas = () => {
  const { selectedColor, wallet, gridState, showToast, brushSize, zoom, setZoom, offset, setOffset, minZoom, setMinZoom, auctionState, paintLocked } = useApp();
  const { paintPixel, paintPixels } = useSocket();
  const navigate = useNavigate();

  // Canvas state (local, not shared)
  const [isPanning, setIsPanning] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [hoverPixel, setHoverPixel] = useState(null); // { x, y }

  // Refs
  const panStart = useRef({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const lastPaintedPixel = useRef(null); // For drag-to-paint throttling
  const hoverThrottleRef = useRef(null); // For hover throttling
  const strokeBlockedRef = useRef(false); // Debounce redirect when dragging into auction zone

  // ── Smooth zoom (eased lerp toward a target) ──
  const targetZoomRef = useRef(zoom);
  const zoomFocusRef = useRef(null);   // {x,y} in screen px to keep stable under zoom
  const zoomRafRef = useRef(null);

  const animateZoom = useCallback(() => {
    if (zoomRafRef.current) return;
    const step = () => {
      let stop = false;
      setZoom((prev) => {
        const target = targetZoomRef.current;
        const diff = target - prev;
        if (Math.abs(diff) < 0.01) { stop = true; return target; }
        const next = prev + diff * 0.22; // ease factor
        // Keep the focal screen point stable
        const focus = zoomFocusRef.current;
        if (focus) {
          // worldX = (screenX - offset.x) / prev
          // newOffset.x = screenX - worldX * next
          setOffset((prevOffset) => {
            const worldX = (focus.x - prevOffset.x) / prev;
            const worldY = (focus.y - prevOffset.y) / prev;
            return {
              x: focus.x - worldX * next,
              y: focus.y - worldY * next,
            };
          });
        }
        return next;
      });
      if (stop) {
        zoomRafRef.current = null;
      } else {
        zoomRafRef.current = requestAnimationFrame(step);
      }
    };
    zoomRafRef.current = requestAnimationFrame(step);
  }, [setZoom, setOffset]);

  // ── Pan momentum ──
  const panVelocityRef = useRef({ vx: 0, vy: 0 });
  const lastMoveRef = useRef({ x: 0, y: 0, t: 0 });
  const momentumRafRef = useRef(null);

  const startMomentum = useCallback(() => {
    if (momentumRafRef.current) return;
    const step = () => {
      const { vx, vy } = panVelocityRef.current;
      if (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) {
        momentumRafRef.current = null;
        panVelocityRef.current = { vx: 0, vy: 0 };
        return;
      }
      setOffset((o) => ({ x: o.x + vx, y: o.y + vy }));
      panVelocityRef.current = { vx: vx * 0.92, vy: vy * 0.92 };
      momentumRafRef.current = requestAnimationFrame(step);
    };
    momentumRafRef.current = requestAnimationFrame(step);
  }, [setOffset]);

  // Cleanup rAFs on unmount
  useEffect(() => () => {
    if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
    if (momentumRafRef.current) cancelAnimationFrame(momentumRafRef.current);
  }, []);

  /**
   * Returns a reason if the (x,y) coord lies inside a blocked auction zone,
   * or null otherwise. The zone is blocked if:
   *   - the auction is active (no one paints here yet), OR
   *   - the auction is closed AND the wallet is not the winner.
   */
  const auctionBlockReason = useCallback((x, y) => {
    if (!auctionState) return null;
    const { active, sectionX, sectionY, endTs, winner } = auctionState;
    if (sectionX === undefined || sectionX === null) return null;
    const ZONE = 20;
    const inside = x >= sectionX && x < sectionX + ZONE && y >= sectionY && y < sectionY + ZONE;
    if (!inside) return null;
    const now = Math.floor(Date.now() / 1000);
    if (active && now < (endTs ?? 0)) return 'auction-active';
    if (winner && winner !== '' && winner !== wallet?.address) return 'winner-only';
    return null;
  }, [auctionState, wallet?.address]);

  /**
   * Calculate pixel coordinates from mouse event
   */
  const getPixelCoords = useCallback((e) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - offset.x) / zoom);
    const y = Math.floor((e.clientY - rect.top - offset.y) / zoom);
    if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE) {
      return { x, y };
    }
    return null;
  }, [offset, zoom]);

  /**
   * Paint at current mouse position
   */
  const paintAtPosition = useCallback((e) => {
    if (!wallet.isConnected) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    // Epoch gate — block paints in the dead window between endEpoch and
    // the next startEpochWithAuction. The lock state is computed in
    // AppContext from epochInfo + the contract's `isEpochEnded` flag.
    // Reuse strokeBlockedRef so a drag stroke fires the toast at most once.
    if (paintLocked) {
      if (!strokeBlockedRef.current) {
        strokeBlockedRef.current = true;
        showToast('Wait for the next epoch to start so you can paint.', 'warning');
      }
      return;
    }

    const coords = getPixelCoords(e);
    if (!coords) return;

    // Block painting if any pixel in the brush footprint sits in a locked
    // auction zone. Show a toast and (once per stroke) redirect to /auction.
    const allBrushPixels = getBrushPixels(coords.x, coords.y, brushSize, selectedColor);
    const blockedReason = allBrushPixels
      .map(p => auctionBlockReason(p.x, p.y))
      .find(r => r !== null);
    if (blockedReason) {
      if (!strokeBlockedRef.current) {
        strokeBlockedRef.current = true;
        showToast(
          blockedReason === 'auction-active'
            ? 'This zone is locked during the live auction. Bid to claim it!'
            : 'This zone is reserved for the auction winner this epoch.',
          'warning'
        );
        setTimeout(() => navigate('/auction'), 700);
      }
      return;
    }

    // Skip if same pixel (for drag painting)
    if (lastPaintedPixel.current &&
        lastPaintedPixel.current.x === coords.x &&
        lastPaintedPixel.current.y === coords.y) {
      return;
    }

    const pixels = allBrushPixels;
    if (pixels.length === 0) return;

    lastPaintedPixel.current = coords;

    if (brushSize === 1) {
      const success = paintPixel(coords.x, coords.y, selectedColor);
      if (success) {
        console.log(`🎨 Painting pixel: (${coords.x}, ${coords.y}) ${selectedColor}`);
      }
    } else {
      const success = paintPixels(pixels);
      if (success) {
        console.log(`🎨 Painting ${pixels.length} pixels with ${brushSize}x${brushSize} brush`);
      }
    }
  }, [wallet, brushSize, selectedColor, paintPixel, paintPixels, showToast, getPixelCoords, auctionBlockReason, navigate, paintLocked]);

  /**
   * Handle mouse wheel zoom — eased toward a target, focal point preserved
   * so the pixel under the cursor stays put as you zoom in.
   */
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    const next = Math.max(minZoom, Math.min(MAX_ZOOM, targetZoomRef.current + delta));
    targetZoomRef.current = next;
    // Capture the screen-space focal point of the wheel event
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      zoomFocusRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    animateZoom();
  }, [minZoom, animateZoom]);

  /**
   * Handle mouse down (start panning or painting)
   */
  const handleMouseDown = useCallback((e) => {
    // Cancel any in-flight pan momentum on a fresh click
    if (momentumRafRef.current) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
      panVelocityRef.current = { vx: 0, vy: 0 };
    }
    if (e.button === 0) {
      // Left click - start painting
      e.preventDefault();
      setIsPainting(true);
      lastPaintedPixel.current = null;
      paintAtPosition(e);
    } else if (e.button === 1 || e.button === 2) {
      // Middle or right mouse button - pan
      e.preventDefault();
      setIsPanning(true);
      panStart.current = {
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      };
      lastMoveRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
  }, [offset, paintAtPosition]);

  /**
   * Handle mouse move (panning, painting, or hover)
   */
  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      // Pan camera
      setOffset({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      });
      // Track velocity for momentum on release (px / 16ms frame)
      const now = performance.now();
      const last = lastMoveRef.current;
      const dt = Math.max(1, now - last.t);
      panVelocityRef.current = {
        vx: ((e.clientX - last.x) / dt) * 16,
        vy: ((e.clientY - last.y) / dt) * 16,
      };
      lastMoveRef.current = { x: e.clientX, y: e.clientY, t: now };
    } else {
      // Update hover pixel with throttling
      const coords = getPixelCoords(e);

      // Throttle hover updates to reduce redraws
      if (hoverThrottleRef.current) {
        clearTimeout(hoverThrottleRef.current);
      }

      hoverThrottleRef.current = setTimeout(() => {
        setHoverPixel(coords);
      }, 16); // ~60fps

      // Paint while dragging
      if (isPainting) {
        paintAtPosition(e);
      }
    }
  }, [isPanning, isPainting, setOffset, getPixelCoords, paintAtPosition]);

  /**
   * Handle mouse up (stop panning and painting)
   */
  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      // Trigger momentum decay if the user released with meaningful velocity
      const { vx, vy } = panVelocityRef.current;
      if (Math.abs(vx) > 1 || Math.abs(vy) > 1) startMomentum();
    }
    setIsPanning(false);
    setIsPainting(false);
    lastPaintedPixel.current = null;
    strokeBlockedRef.current = false;
  }, [isPanning, startMomentum]);

  /**
   * Handle mouse leave (clear hover and stop painting)
   */
  const handleMouseLeave = useCallback(() => {
    setHoverPixel(null);
    setIsPainting(false);
    setIsPanning(false);
    lastPaintedPixel.current = null;
    strokeBlockedRef.current = false;
    if (hoverThrottleRef.current) {
      clearTimeout(hoverThrottleRef.current);
    }
  }, []);

  /**
   * Center canvas in view with appropriate zoom
   */
  const centerCanvas = useCallback((containerWidth, containerHeight) => {
    const padding = 40;
    const availableWidth = containerWidth - padding * 2;
    const availableHeight = containerHeight - padding * 2;
    const fitZoom = Math.min(availableWidth / CANVAS_SIZE, availableHeight / CANVAS_SIZE);
    const initialZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));

    const scaledSize = CANVAS_SIZE * initialZoom;
    const centerX = (containerWidth - scaledSize) / 2;
    const centerY = (containerHeight - scaledSize) / 2;

    // Set this as the minimum zoom level (can't zoom out past initial fit)
    setMinZoom(initialZoom);
    setZoom(initialZoom);
    targetZoomRef.current = initialZoom;
    setOffset({ x: centerX, y: centerY });
  }, [setZoom, setOffset, setMinZoom]);

  /**
   * Zoom in
   */
  const zoomIn = useCallback(() => {
    setZoom((prev) => {
      const next = Math.min(MAX_ZOOM, prev + 1);
      targetZoomRef.current = next;
      return next;
    });
  }, [setZoom]);

  /**
   * Zoom out
   */
  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = Math.max(minZoom, prev - 1);
      targetZoomRef.current = next;
      return next;
    });
  }, [setZoom, minZoom]);

  /**
   * Reset zoom and offset to initial centered view
   */
  const resetView = useCallback(() => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    centerCanvas(rect.width, rect.height);
  }, [centerCanvas]);

  /**
   * Center view on specific pixel
   */
  const centerOn = useCallback((x, y) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setOffset({
      x: centerX - x * zoom,
      y: centerY - y * zoom,
    });
  }, [zoom, setOffset]);

  /**
   * Get visible area of canvas (for optimized rendering)
   */
  const getVisibleArea = useCallback(() => {
    if (!canvasRef.current) {
      return { startX: 0, startY: 0, endX: CANVAS_SIZE, endY: CANVAS_SIZE };
    }

    const rect = canvasRef.current.getBoundingClientRect();

    const startX = Math.max(0, Math.floor(-offset.x / zoom));
    const startY = Math.max(0, Math.floor(-offset.y / zoom));
    const endX = Math.min(CANVAS_SIZE, Math.ceil((rect.width - offset.x) / zoom));
    const endY = Math.min(CANVAS_SIZE, Math.ceil((rect.height - offset.y) / zoom));

    return { startX, startY, endX, endY };
  }, [offset, zoom]);

  /**
   * Check if grid should be displayed (only at high zoom)
   */
  const shouldShowGrid = zoom >= 5;

  return {
    // State
    zoom,
    offset,
    isPanning,
    isPainting,
    hoverPixel,
    canvasRef,
    shouldShowGrid,
    brushSize,
    minZoom,
    setZoom,
    setOffset,

    // Methods
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    zoomIn,
    zoomOut,
    resetView,
    centerOn,
    centerCanvas,
    getVisibleArea,
    auctionBlockReason,

    // Constants
    CANVAS_SIZE,
    MIN_ZOOM,
    MAX_ZOOM,
  };
};
