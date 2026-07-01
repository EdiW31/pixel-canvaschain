import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';

// ColorPicker — swatch + hex/RGB, HSV square + hue strip, tabbed palettes,
// recent colours, and a native-EyeDropper pick button where available.

const PALETTES = {
  Basics: [
    '#000000','#404040','#808080','#C0C0C0','#FFFFFF',
    '#FF0000','#FFA500','#FFFF00','#00FF00','#00FFFF',
    '#0000FF','#800080','#FF00FF','#FF1493','#A52A2A',
  ],
  Pastels: [
    '#FFDFD3','#FEC8D8','#FFCBA4','#FFE5B4','#FFFACD',
    '#E0FFE0','#C1E1C1','#BFEFFF','#B0E0E6','#D8BFD8',
    '#E6E6FA','#FFB6C1','#F5DEB3','#FFDAB9','#FFE4E1',
  ],
  Earth: [
    '#3B2F2F','#6B4423','#8B4513','#A0522D','#CD853F',
    '#DEB887','#F4A460','#D2B48C','#BC9A6A','#8FBC8F',
    '#556B2F','#6B8E23','#808000','#9ACD32','#2F4F4F',
  ],
  Neon: [
    '#FF073A','#FF6EC7','#F600FF','#9D00FF','#0080FF',
    '#00F5FF','#39FF14','#CCFF00','#FFFF33','#FF8800',
  ],
};

// Color conversion helpers.
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
};
const rgbToHex = (r, g, b) =>
  '#' + [r,g,b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2,'0')).join('').toUpperCase();
const rgbToHsv = (r, g, b) => {
  r/=255; g/=255; b/=255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if      (max === r) h = ((g-b)/d) % 6;
    else if (max === g) h = (b-r)/d + 2;
    else                h = (r-g)/d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d/max, v: max };
};
const hsvToRgb = (h, s, v) => {
  const c = v * s;
  const x = c * (1 - Math.abs(((h/60) % 2) - 1));
  const m = v - c;
  let r=0,g=0,b=0;
  if (h <  60) { r=c; g=x; }
  else if (h < 120) { r=x; g=c; }
  else if (h < 180) { g=c; b=x; }
  else if (h < 240) { g=x; b=c; }
  else if (h < 300) { r=x; b=c; }
  else              { r=c; b=x; }
  return { r: (r+m)*255, g: (g+m)*255, b: (b+m)*255 };
};

const ColorPicker = () => {
  const { selectedColor, changeColor, colorHistory } = useApp();

  // Current HSV mirrors selectedColor
  const initial = rgbToHsv(...Object.values(hexToRgb(selectedColor)));
  const [hsv, setHsv] = useState(initial);
  const [customHex, setCustomHex] = useState(selectedColor);
  const [tab, setTab] = useState('Basics');

  // Keep local HSV in sync if the AppContext color changes externally
  useEffect(() => {
    const rgb = hexToRgb(selectedColor);
    setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
    setCustomHex(selectedColor);
  }, [selectedColor]);

  // Apply new HSV to the global selected color
  const applyHsv = useCallback((newHsv) => {
    setHsv(newHsv);
    const rgb = hsvToRgb(newHsv.h, newHsv.s, newHsv.v);
    changeColor(rgbToHex(rgb.r, rgb.g, rgb.b));
  }, [changeColor]);

  // HSV square drag.
  const squareRef = useRef(null);
  const onSquareDown = (e) => {
    const handleMove = (evt) => {
      const rect = squareRef.current.getBoundingClientRect();
      const clientX = evt.clientX ?? evt.touches?.[0]?.clientX ?? 0;
      const clientY = evt.clientY ?? evt.touches?.[0]?.clientY ?? 0;
      const x = Math.max(0, Math.min(rect.width,  clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      applyHsv({ h: hsv.h, s: x / rect.width, v: 1 - y / rect.height });
    };
    handleMove(e);
    const onUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', onUp);
  };

  // Hue strip drag.
  const hueRef = useRef(null);
  const onHueDown = (e) => {
    const handleMove = (evt) => {
      const rect = hueRef.current.getBoundingClientRect();
      const clientX = evt.clientX ?? evt.touches?.[0]?.clientX ?? 0;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      applyHsv({ ...hsv, h: (x / rect.width) * 360 });
    };
    handleMove(e);
    const onUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', onUp);
  };

  // Hex input.
  const onHexChange = (e) => {
    setCustomHex(e.target.value.toUpperCase());
  };
  const onHexSubmit = (e) => {
    e.preventDefault();
    if (/^#[0-9A-F]{6}$/i.test(customHex)) changeColor(customHex.toUpperCase());
  };

  // Eyedropper (native API where available)
  const hasEyedropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  const pickWithEyedropper = async () => {
    try {
      const result = await new window.EyeDropper().open();
      if (result?.sRGBHex) changeColor(result.sRGBHex.toUpperCase());
    } catch (_) { /* user cancelled */ }
  };

  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const hueColor = `hsl(${hsv.h}, 100%, 50%)`;

  return (
    <div className="w-64 card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-base font-semibold">Colour</h3>
        {hasEyedropper && (
          <button
            onClick={pickWithEyedropper}
            title="Pick a colour from anywhere on screen"
            className="btn-ghost text-xs px-2 py-1"
          >
            <EyedropperIcon /> Pick
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 rounded-lg border border-borderStrong shadow-soft flex-shrink-0"
          style={{ backgroundColor: selectedColor }}
        />
        <form onSubmit={onHexSubmit} className="flex-1 min-w-0">
          <input
            type="text"
            value={customHex}
            onChange={onHexChange}
            onBlur={onHexSubmit}
            maxLength={7}
            className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm font-mono focus:outline-none focus:border-primary focus:shadow-focus"
          />
          <div className="text-[10px] text-textMuted mt-1 font-mono">
            rgb({Math.round(rgb.r)}, {Math.round(rgb.g)}, {Math.round(rgb.b)})
          </div>
        </form>
      </div>

      <div>
        <div
          ref={squareRef}
          onMouseDown={onSquareDown}
          className="relative w-full h-24 rounded-md cursor-crosshair overflow-hidden shadow-soft select-none"
          style={{
            background: `
              linear-gradient(to top, #000, transparent),
              linear-gradient(to right, #fff, ${hueColor})
            `,
          }}
        >
          <div
            className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow-card pointer-events-none"
            style={{
              left: `${hsv.s * 100}%`,
              top:  `${(1 - hsv.v) * 100}%`,
            }}
          />
        </div>

        <div
          ref={hueRef}
          onMouseDown={onHueDown}
          className="relative w-full h-3 rounded-md cursor-pointer mt-2 select-none"
          style={{
            background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
        >
          <div
            className="absolute w-3 h-5 -ml-1.5 -mt-1 rounded-sm border-2 border-white shadow-card pointer-events-none"
            style={{ left: `${(hsv.h / 360) * 100}%` }}
          />
        </div>
      </div>

      <div>
        <div className="flex gap-1 mb-2 text-xs">
          {Object.keys(PALETTES).map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={`px-2 py-1 rounded-md font-medium transition-colors ${
                tab === name
                  ? 'bg-primaryLight text-primaryDark'
                  : 'text-textMuted hover:text-textPrimary hover:bg-backgroundAlt'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {PALETTES[tab].map((color) => (
            <button
              key={color}
              onClick={() => changeColor(color)}
              className={`w-full aspect-square rounded border transition-all hover:scale-110 ${
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

      {colorHistory.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">Recent</p>
          <div className="flex gap-1.5">
            {colorHistory.slice(0, 8).map((color, i) => (
              <button
                key={`${color}-${i}`}
                onClick={() => changeColor(color)}
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
    </div>
  );
};

const EyedropperIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 22l4.5-4.5M14 5l5 5M11 8l8 8M16.5 2.5a3.536 3.536 0 0 1 5 5L9 20l-5 1 1-5L16.5 2.5z" />
  </svg>
);

export default ColorPicker;
