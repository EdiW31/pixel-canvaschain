import { useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * ColorPicker - Color selection component
 *
 * Features:
 * - 30 preset colors in a grid
 * - Custom hex color input
 * - Color history (last 5 colors)
 * - Selected color highlight with neon glow
 */

// Preset color palette (30 colors)
const PRESET_COLORS = [
  // Basic
  '#FFFFFF', // White
  '#000000', // Black
  '#808080', // Gray
  '#C0C0C0', // Light Gray
  '#404040', // Dark Gray

  // Primary
  '#FF0000', // Red
  '#00FF00', // Green
  '#0000FF', // Blue
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta

  // Secondary
  '#FFA500', // Orange
  '#800080', // Purple
  '#00FFFF', // Cyan
  '#FFC0CB', // Pink
  '#A52A2A', // Brown

  // Neon
  '#00FFFF', // Cyan Neon
  '#FF00FF', // Magenta Neon
  '#FFFF00', // Yellow Neon
  '#00FF00', // Lime Neon
  '#FF1493', // Hot Pink

  // Pastels
  '#ADD8E6', // Light Blue
  '#FFB6C1', // Light Pink
  '#FFDAB9', // Peach
  '#98FB98', // Mint
  '#F0E68C', // Khaki

  // Dark
  '#000080', // Navy
  '#800000', // Maroon
  '#006400', // Dark Green
  '#8B4513', // Saddle Brown
  '#2F4F4F', // Dark Slate Gray
];

const ColorPicker = () => {
  const { selectedColor, changeColor, colorHistory } = useApp();
  const [customColor, setCustomColor] = useState('');

  /**
   * Handle preset color click
   */
  const handleColorClick = (color) => {
    changeColor(color);
  };

  /**
   * Handle custom color input
   */
  const handleCustomColorSubmit = (e) => {
    e.preventDefault();

    // Validate hex format
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!hexRegex.test(customColor)) {
      alert('Invalid hex color format. Use #RRGGBB');
      return;
    }

    changeColor(customColor.toUpperCase());
    setCustomColor('');
  };

  return (
    <div className="w-64 card p-4">
      <h3 className="font-heading text-base font-semibold mb-4">Color</h3>

      {/* Current Color */}
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">Selected</p>
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-lg border border-borderStrong shadow-soft"
            style={{ backgroundColor: selectedColor }}
          />
          <p className="text-sm font-mono text-textPrimary">{selectedColor}</p>
        </div>
      </div>

      {/* Color History */}
      {colorHistory.length > 0 && (
        <div className="mb-5">
          <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">Recent</p>
          <div className="flex gap-2">
            {colorHistory.map((color, index) => (
              <button
                key={index}
                onClick={() => handleColorClick(color)}
                className={`w-7 h-7 rounded border transition-all hover:scale-110 ${
                  selectedColor === color ? 'border-primary ring-2 ring-primary/40' : 'border-border'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Preset Colors Grid */}
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">Palette</p>
        <div className="grid grid-cols-5 gap-1.5">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => handleColorClick(color)}
              className={`w-9 h-9 rounded border transition-all hover:scale-110 ${
                selectedColor === color
                  ? 'border-primary ring-2 ring-primary/40'
                  : 'border-border hover:border-borderStrong'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Custom Color */}
      <div>
        <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">Custom hex</p>
        <form onSubmit={handleCustomColorSubmit} className="flex gap-2">
          <input
            type="text"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            placeholder="#FF0000"
            className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-sm font-mono text-textPrimary focus:outline-none focus:border-primary focus:shadow-focus"
            maxLength={7}
          />
          <button
            type="submit"
            className="btn-secondary text-sm"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
};

export default ColorPicker;
