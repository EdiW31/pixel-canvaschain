import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useSocket } from './useSocket';

// useCanvas — zoom, pan, painting (single + brush), hover, and view helpers.

const CANVAS_SIZE = 100; // matches server
const MIN_ZOOM = 1;
const MAX_ZOOM = 20;

// All pixels in a brushSize×brushSize square anchored at (x, y).
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

  const [isPanning, setIsPanning] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [hoverPixel, setHoverPixel] = useState(null);

  const panStart = useRef({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const lastPaintedPixel = useRef(null);   // drag-to-paint throttling
  const hoverThrottleRef = useRef(null);
  const strokeBlockedRef = useRef(false);  // fire blocked-toast at most once per stroke

  // Smooth zoom (eased lerp toward a target).
  const targetZoomRef = useRef(zoom);
  const zoomFocusRef = useRef(null);   // screen px to keep stable under zoom
  const zoomRafRef = useRef(null);

  const animateZoom = useCallback(() => {
    if (zoomRafRef.current) return;
    const step = () => {
      let stop = false;
      setZoom((prev) => {
        const target = targetZoomRef.current;
        const diff = target - prev;
        if (Math.abs(diff) < 0.01) { stop = true; return target; }
        const next = prev + diff * 0.22;
        // Keep the focal screen point stable as zoom changes.
        const focus = zoomFocusRef.current;
        if (focus) {
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

  // Pan momentum.
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

  useEffect(() => () => {
    if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
    if (momentumRafRef.current) cancelAnimationFrame(momentumRafRef.current);
  }, []);

  // Reason the (x,y) coord is in a blocked auction zone, or null: blocked while
  // the auction is active, or after close for everyone but the winner.
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

  const paintAtPosition = useCallback((e) => {
    if (!wallet.isConnected) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    // Epoch gate: block paints in the dead window between endEpoch and the next
    // startEpochWithAuction (paintLocked is derived in AppContext).
    if (paintLocked) {
      if (!strokeBlockedRef.current) {
        strokeBlockedRef.current = true;
        showToast('Wait for the next epoch to start so you can paint.', 'warning');
      }
      return;
    }

    const coords = getPixelCoords(e);
    if (!coords) return;

    // Block the paint if any brush pixel sits in a locked auction zone, and
    // (once per stroke) redirect to /auction.
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

    // Skip if still on the same pixel (drag painting).
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

  // Wheel zoom — eased toward a target, focal point under the cursor preserved.
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    const next = Math.max(minZoom, Math.min(MAX_ZOOM, targetZoomRef.current + delta));
    targetZoomRef.current = next;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      zoomFocusRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    animateZoom();
  }, [minZoom, animateZoom]);

  const handleMouseDown = useCallback((e) => {
    // Cancel in-flight pan momentum on a fresh click.
    if (momentumRafRef.current) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
      panVelocityRef.current = { vx: 0, vy: 0 };
    }
    if (e.button === 0) {
      e.preventDefault();
      setIsPainting(true);
      lastPaintedPixel.current = null;
      paintAtPosition(e);
    } else if (e.button === 1 || e.button === 2) {
      // Middle/right button — pan.
      e.preventDefault();
      setIsPanning(true);
      panStart.current = {
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      };
      lastMoveRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
  }, [offset, paintAtPosition]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      });
      // Track velocity for release momentum (px / 16ms frame).
      const now = performance.now();
      const last = lastMoveRef.current;
      const dt = Math.max(1, now - last.t);
      panVelocityRef.current = {
        vx: ((e.clientX - last.x) / dt) * 16,
        vy: ((e.clientY - last.y) / dt) * 16,
      };
      lastMoveRef.current = { x: e.clientX, y: e.clientY, t: now };
    } else {
      const coords = getPixelCoords(e);

      // Throttle hover updates to ~60fps to reduce redraws.
      if (hoverThrottleRef.current) {
        clearTimeout(hoverThrottleRef.current);
      }
      hoverThrottleRef.current = setTimeout(() => {
        setHoverPixel(coords);
      }, 16);

      if (isPainting) {
        paintAtPosition(e);
      }
    }
  }, [isPanning, isPainting, setOffset, getPixelCoords, paintAtPosition]);

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      const { vx, vy } = panVelocityRef.current;
      if (Math.abs(vx) > 1 || Math.abs(vy) > 1) startMomentum();
    }
    setIsPanning(false);
    setIsPainting(false);
    lastPaintedPixel.current = null;
    strokeBlockedRef.current = false;
  }, [isPanning, startMomentum]);

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

  // Center the canvas and set the minimum (fit) zoom.
  const centerCanvas = useCallback((containerWidth, containerHeight) => {
    const padding = 40;
    const availableWidth = containerWidth - padding * 2;
    const availableHeight = containerHeight - padding * 2;
    const fitZoom = Math.min(availableWidth / CANVAS_SIZE, availableHeight / CANVAS_SIZE);
    const initialZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));

    const scaledSize = CANVAS_SIZE * initialZoom;
    const centerX = (containerWidth - scaledSize) / 2;
    const centerY = (containerHeight - scaledSize) / 2;

    setMinZoom(initialZoom);
    setZoom(initialZoom);
    targetZoomRef.current = initialZoom;
    setOffset({ x: centerX, y: centerY });
  }, [setZoom, setOffset, setMinZoom]);

  const zoomIn = useCallback(() => {
    setZoom((prev) => {
      const next = Math.min(MAX_ZOOM, prev + 1);
      targetZoomRef.current = next;
      return next;
    });
  }, [setZoom]);

  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = Math.max(minZoom, prev - 1);
      targetZoomRef.current = next;
      return next;
    });
  }, [setZoom, minZoom]);

  const resetView = useCallback(() => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    centerCanvas(rect.width, rect.height);
  }, [centerCanvas]);

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

  // Visible canvas bounds, for render culling.
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

  const shouldShowGrid = zoom >= 5;

  return {
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

    CANVAS_SIZE,
    MIN_ZOOM,
    MAX_ZOOM,
  };
};
