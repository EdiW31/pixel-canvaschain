import { useState, useRef, useCallback, useEffect } from 'react';
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
  const { selectedColor, wallet, gridState, showToast, brushSize, zoom, setZoom, offset, setOffset, minZoom, setMinZoom } = useApp();
  const { paintPixel, paintPixels } = useSocket();

  // Canvas state (local, not shared)
  const [isPanning, setIsPanning] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [hoverPixel, setHoverPixel] = useState(null); // { x, y }

  // Refs
  const panStart = useRef({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const lastPaintedPixel = useRef(null); // For drag-to-paint throttling
  const hoverThrottleRef = useRef(null); // For hover throttling

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

    const coords = getPixelCoords(e);
    if (!coords) return;

    // Skip if same pixel (for drag painting)
    if (lastPaintedPixel.current &&
        lastPaintedPixel.current.x === coords.x &&
        lastPaintedPixel.current.y === coords.y) {
      return;
    }

    const requiredCredits = brushSize * brushSize;
    if (wallet.credits < requiredCredits) {
      showToast(`Insufficient credits. Need ${requiredCredits}, have ${wallet.credits}.`, 'error');
      return;
    }

    const pixels = getBrushPixels(coords.x, coords.y, brushSize, selectedColor);
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
  }, [wallet, brushSize, selectedColor, paintPixel, paintPixels, showToast, getPixelCoords]);

  /**
   * Handle mouse wheel zoom
   */
  const handleWheel = useCallback((e) => {
    e.preventDefault();

    const delta = e.deltaY > 0 ? -0.5 : 0.5;
    setZoom((prev) => {
      // Use minZoom (initial fit zoom) as the minimum, not MIN_ZOOM constant
      const newZoom = Math.max(minZoom, Math.min(MAX_ZOOM, prev + delta));
      return newZoom;
    });
  }, [setZoom, minZoom]);

  /**
   * Handle mouse down (start panning or painting)
   */
  const handleMouseDown = useCallback((e) => {
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
    setIsPanning(false);
    setIsPainting(false);
    lastPaintedPixel.current = null;
  }, []);

  /**
   * Handle mouse leave (clear hover and stop painting)
   */
  const handleMouseLeave = useCallback(() => {
    setHoverPixel(null);
    setIsPainting(false);
    setIsPanning(false);
    lastPaintedPixel.current = null;
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
    setOffset({ x: centerX, y: centerY });
  }, [setZoom, setOffset, setMinZoom]);

  /**
   * Zoom in
   */
  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + 1));
  }, [setZoom]);

  /**
   * Zoom out
   */
  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(minZoom, prev - 1));
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

    // Constants
    CANVAS_SIZE,
    MIN_ZOOM,
    MAX_ZOOM,
  };
};
