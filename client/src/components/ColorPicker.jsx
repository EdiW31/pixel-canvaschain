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
    <div className="w-64 bg-surface p-4 rounded-lg border border-primary/20">
      <h3 className="text-lg font-heading font-bold text-primary mb-4">Color Picker</h3>

      {/* Current Color Display */}
      <div className="mb-4">
        <p className="text-xs text-textSecondary mb-2">Selected Color</p>
        <div className="flex items-center space-x-3">
          <div
            className="w-16 h-16 rounded-lg border-2 border-primary shadow-neon-cyan"
            style={{ backgroundColor: selectedColor }}
          />
          <div>
            <p className="text-sm font-mono text-textPrimary">{selectedColor}</p>
          </div>
        </div>
      </div>

      {/* Color History */}
      {colorHistory.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-textSecondary mb-2">Recent Colors</p>
          <div className="flex space-x-2">
            {colorHistory.map((color, index) => (
              <button
                key={index}
                onClick={() => handleColorClick(color)}
                className={`w-8 h-8 rounded border-2 transition-all hover:scale-110 ${
                  selectedColor === color
                    ? 'border-primary shadow-neon-cyan'
                    : 'border-surface hover:border-primary'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Preset Colors Grid */}
      <div className="mb-4">
        <p className="text-xs text-textSecondary mb-2">Preset Colors</p>
        <div className="grid grid-cols-5 gap-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => handleColorClick(color)}
              className={`w-10 h-10 rounded border-2 transition-all hover:scale-110 ${
                selectedColor === color
                  ? 'border-primary shadow-neon-cyan ring-2 ring-primary'
                  : 'border-surface hover:border-primary'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Custom Color Input */}
      <div>
        <p className="text-xs text-textSecondary mb-2">Custom Hex Color</p>
        <form onSubmit={handleCustomColorSubmit} className="flex space-x-2">
          <input
            type="text"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            placeholder="#FF0000"
            className="flex-1 px-3 py-2 bg-background border border-primary/30 rounded text-sm font-mono text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            maxLength={7}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary/10 border border-primary rounded text-primary hover:bg-primary hover:text-background transition-all duration-300 text-sm font-bold"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
};

export default ColorPicker;
