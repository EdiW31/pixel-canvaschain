import { useCanvas } from '../hooks/useCanvas';
import { useApp } from '../context/AppContext';

/**
 * Toolbar - Canvas controls sidebar
 *
 * Features:
 * - Zoom in/out buttons
 * - Zoom level slider
 * - Brush size slider (1-4)
 * - Reset view button
 * - Current coordinates display
 */

const MIN_BRUSH = 1;
const MAX_BRUSH = 4;

const Toolbar = () => {
  const {
    zoom,
    hoverPixel,
    zoomIn,
    zoomOut,
    resetView,
    minZoom,
    MAX_ZOOM,
  } = useCanvas();

  const { brushSize, setBrushSize } = useApp();

  const brushCost = brushSize * brushSize;

  return (
    <div className="w-52 card p-4 space-y-5">
      <h3 className="font-heading text-base font-semibold">Controls</h3>

      {/* Zoom */}
      <div>
        <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">Zoom</p>
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={zoomOut}
            disabled={zoom <= minZoom}
            className="w-9 h-9 rounded-md border border-border text-textPrimary hover:bg-backgroundAlt disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium text-lg"
          >
            −
          </button>
          <div className="flex-1 text-center">
            <p className="text-base font-semibold text-textPrimary">{zoom.toFixed(1)}×</p>
          </div>
          <button
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="w-9 h-9 rounded-md border border-border text-textPrimary hover:bg-backgroundAlt disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium text-lg"
          >
            +
          </button>
        </div>
        <div className="w-full bg-backgroundAlt rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((zoom - minZoom) / (MAX_ZOOM - minZoom)) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-textMuted mt-1">
          <span>{minZoom.toFixed(1)}×</span>
          <span>{MAX_ZOOM}×</span>
        </div>
      </div>

      {/* Brush */}
      <div>
        <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">Brush</p>
        <input
          type="range"
          min={MIN_BRUSH}
          max={MAX_BRUSH}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-full h-1.5 bg-backgroundAlt rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between text-xs text-textMuted mt-1 mb-2">
          <span>{MIN_BRUSH}×{MIN_BRUSH}</span>
          <span>{MAX_BRUSH}×{MAX_BRUSH}</span>
        </div>
        <div className="bg-backgroundAlt rounded-md p-2 text-center">
          <p className="text-sm font-semibold text-textPrimary">
            {brushSize}×{brushSize}
          </p>
          <p className="text-xs text-textMuted mt-0.5">
            <span className="text-charityDark font-semibold">{brushCost}</span> credit{brushCost !== 1 ? 's' : ''} per stroke
          </p>
        </div>
      </div>

      {/* Reset View */}
      <button onClick={resetView} className="btn-secondary w-full text-sm">
        Reset view
      </button>

      {/* Coordinates */}
      <div>
        <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">Cursor</p>
        <div className="bg-backgroundAlt rounded-md p-3">
          {hoverPixel ? (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-textMuted">X</span>
                <span className="font-mono font-semibold text-textPrimary">{hoverPixel.x}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-textMuted">Y</span>
                <span className="font-mono font-semibold text-textPrimary">{hoverPixel.y}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-textMuted text-center">Hover over canvas</p>
          )}
        </div>
      </div>

      {/* Tip */}
      <div className="pt-4 border-t border-border">
        <p className="text-xs text-textMuted leading-relaxed">
          Scroll to zoom. Right-click drag to pan.
        </p>
      </div>
    </div>
  );
};

export default Toolbar;
