import { useRef } from 'react';
import { useApp } from '../context/AppContext';

/**
 * ReferenceImage — left-sidebar panel for the canvas reference overlay.
 *
 * Renders as a card above ColorPicker. When no image is loaded shows an
 * upload button; when loaded shows opacity, lock, reset, replace, remove.
 */
const ReferenceImage = () => {
  const {
    refImageSrc, setRefImageSrc,
    refImageOpacity, setRefImageOpacity,
    setRefImageRect,
    refImageLocked, setRefImageLocked,
  } = useApp();
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('Image too large (max 8 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRefImageSrc(ev.target.result);
      setRefImageRect({ x: 0, y: 0, w: 100, h: 100 });
      setRefImageLocked(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="w-72 card p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CameraIcon />
          <h3 className="font-heading text-base font-semibold">Reference</h3>
        </div>
        {refImageSrc && (
          <button
            onClick={() => setRefImageSrc(null)}
            className="text-textMuted hover:text-error transition-colors text-lg leading-none"
            title="Remove reference overlay"
          >
            ×
          </button>
        )}
      </div>

      {!refImageSrc ? (
        /* ── No image: upload prompt ── */
        <label className="flex flex-col items-center justify-center gap-2 w-full h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/60 bg-backgroundAlt hover:bg-primaryLight/30 cursor-pointer transition-colors group">
          <UploadIcon className="text-textMuted group-hover:text-primary transition-colors" />
          <span className="text-xs text-textMuted group-hover:text-primary transition-colors font-medium">
            Upload reference image
          </span>
          <span className="text-[10px] text-textMuted">PNG, JPG, WEBP · max 8 MB</span>
          <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={handleFile} />
        </label>
      ) : (
        /* ── Image loaded: controls ── */
        <>
          {/* Thumbnail */}
          <div className="w-full h-20 rounded-md overflow-hidden border border-border bg-backgroundAlt flex-shrink-0">
            <img src={refImageSrc} alt="Reference" className="w-full h-full object-contain" />
          </div>

          {/* Opacity */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-textMuted uppercase tracking-wider font-medium">Opacity</span>
              <span className="text-xs font-semibold tabular-nums text-textSecondary">
                {Math.round(refImageOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="5" max="100"
              value={Math.round(refImageOpacity * 100)}
              onChange={(e) => setRefImageOpacity(Number(e.target.value) / 100)}
              className="w-full h-1.5 accent-primary"
            />
          </div>

          {/* Lock toggle */}
          <button
            onClick={() => setRefImageLocked((l) => !l)}
            title={refImageLocked ? 'Unlock — move & resize image' : 'Lock — paint over image normally'}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              refImageLocked
                ? 'bg-primary/15 border-primary/50 text-primary hover:bg-primary/25'
                : 'border-border text-textMuted hover:border-primary/40 hover:text-primary bg-backgroundAlt'
            }`}
          >
            {refImageLocked ? <LockIcon /> : <UnlockIcon />}
            {refImageLocked ? 'Locked — click to move' : 'Unlocked — drag to reposition'}
          </button>

          {/* Reset + Replace row */}
          <div className="flex gap-2">
            <button
              onClick={() => setRefImageRect({ x: 0, y: 0, w: 100, h: 100 })}
              className="flex-1 py-1.5 rounded-md text-xs font-medium border border-border text-textMuted hover:text-textPrimary hover:border-borderStrong bg-backgroundAlt transition-colors"
              title="Reset image to cover full canvas"
            >
              Reset position
            </button>
            <label
              className="flex-1 py-1.5 rounded-md text-xs font-medium border border-border text-textMuted hover:text-textPrimary hover:border-borderStrong bg-backgroundAlt transition-colors cursor-pointer text-center"
              title="Replace reference image"
            >
              Replace
              <input type="file" accept="image/*" className="sr-only" onChange={handleFile} />
            </label>
          </div>
        </>
      )}
    </div>
  );
};

const CameraIcon = ({ className = '' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const UploadIcon = ({ className = '' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const LockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const UnlockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

export default ReferenceImage;
