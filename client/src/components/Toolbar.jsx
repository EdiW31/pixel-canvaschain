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
    <div className="w-48 bg-surface p-4 rounded-lg border border-primary/20 space-y-4">
      <h3 className="text-lg font-heading font-bold text-primary mb-4">Controls</h3>

      {/* Zoom Controls */}
      <div>
        <p className="text-xs text-textSecondary mb-2">Zoom Level</p>
        <div className="flex items-center space-x-2 mb-2">
          <button
            onClick={zoomOut}
            disabled={zoom <= minZoom}
            className="w-10 h-10 bg-primary/10 border border-primary rounded text-primary hover:bg-primary hover:text-background disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 font-bold text-xl"
          >
            −
          </button>
          <div className="flex-1 text-center">
            <p className="text-lg font-bold text-primary">{zoom.toFixed(1)}x</p>
          </div>
          <button
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="w-10 h-10 bg-primary/10 border border-primary rounded text-primary hover:bg-primary hover:text-background disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 font-bold text-xl"
          >
            +
          </button>
        </div>

        {/* Zoom Range Indicator */}
        <div className="w-full bg-background rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
            style={{
              width: `${((zoom - minZoom) / (MAX_ZOOM - minZoom)) * 100}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-textSecondary mt-1">
          <span>{minZoom.toFixed(1)}x</span>
          <span>{MAX_ZOOM}x</span>
        </div>
      </div>

      {/* Brush Size Controls */}
      <div>
        <p className="text-xs text-textSecondary mb-2">Brush Size</p>
        <div className="space-y-2">
          <input
            type="range"
            min={MIN_BRUSH}
            max={MAX_BRUSH}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer accent-secondary"
          />
          <div className="flex justify-between text-xs text-textSecondary">
            <span>{MIN_BRUSH}×{MIN_BRUSH}</span>
            <span>{MAX_BRUSH}×{MAX_BRUSH}</span>
          </div>
          <div className="bg-background border border-secondary/30 rounded p-2 text-center">
            <p className="text-sm font-bold text-secondary">
              Brush: {brushSize}×{brushSize}
            </p>
            <p className="text-xs text-textSecondary mt-1">
              Cost: <span className="text-primary font-bold">{brushCost}</span> credits
            </p>
          </div>
        </div>
      </div>

      {/* Reset View */}
      <button
        onClick={resetView}
        className="w-full px-4 py-2 bg-secondary/10 border border-secondary rounded text-secondary hover:bg-secondary hover:text-background transition-all duration-300 text-sm font-bold"
      >
        Reset View
      </button>

      {/* Coordinates Display */}
      <div>
        <p className="text-xs text-textSecondary mb-2">Cursor Position</p>
        <div className="bg-background border border-primary/30 rounded p-3">
          {hoverPixel ? (
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-xs text-textSecondary">X:</span>
                <span className="text-sm font-mono font-bold text-primary">
                  {hoverPixel.x}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-textSecondary">Y:</span>
                <span className="text-sm font-mono font-bold text-primary">
                  {hoverPixel.y}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-textSecondary text-center">
              Hover over canvas
            </p>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="pt-4 border-t border-primary/20">
        <p className="text-xs text-textSecondary leading-relaxed">
          💡 <span className="text-primary font-bold">Tip:</span> Use mouse wheel to zoom faster!
        </p>
      </div>
    </div>
  );
};

export default Toolbar;
