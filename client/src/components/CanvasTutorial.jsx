import { useState, useEffect } from 'react';
import PixelMan from './PixelMan';

// One-time PixelMan-led tour of the canvas, shown the first time per session
// (gated by sessionStorage). Renders when `open` is true and reports back via
// onComplete / onSkip; Skip still continues to /login.
const STORAGE_KEY = 'canvas_tutorial_seen';

const STEPS = [
  {
    emoji: '👋',
    title: "Hi, I'm Pixelman!",
    body: "Quick 30-second tour of the canvas menu — then you're free to paint.",
  },
  {
    emoji: '🎨',
    title: 'Color picker (left panel)',
    body: 'Pick any colour from the wheel, or tap a recent one from your history below it.',
  },
  {
    emoji: '🖌',
    title: 'Brush (right panel)',
    body: 'Switch between 1×1 and 4×4 brushes. Bigger brush = more PIXEL tokens per stroke.',
  },
  {
    emoji: '🔍',
    title: 'Zoom & Reset',
    body: 'Use +/- or pinch to zoom in for precision. Hit R or “Reset view” if you ever get lost.',
  },
  {
    emoji: '💸',
    title: 'Pending & Submit',
    body: 'Painted pixels stack in the Pending box. Click Submit & Pay to commit them on-chain.',
  },
];

const CanvasTutorial = ({ open, onComplete, onSkip }) => {
  const [step, setStep] = useState(0);

  // Reset to step 0 each time the tour reopens (e.g. user reloads mid-session).
  useEffect(() => { if (open) setStep(0); }, [open]);

  if (!open) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const finish = (kind /* 'complete' | 'skip' */) => {
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (_) { /* private mode */ }
    if (kind === 'skip') onSkip?.();
    else onComplete?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
      style={{ padding: 24 }}
    >
      <style>{`
        @keyframes ct-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      `}</style>

      <div
        className="card"
        style={{
          maxWidth: 520, width: '100%',
          padding: '28px 28px 22px',
          borderRadius: 18,
          border: '2.5px solid #1B1A17',
          background: 'rgb(var(--surface))',
          position: 'relative',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <button
          onClick={() => finish('skip')}
          style={{
            position: 'absolute', top: 12, right: 14,
            background: 'transparent', border: 'none',
            color: 'rgb(var(--text-muted))',
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer', padding: 4,
          }}
        >
          Skip tour →
        </button>

        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          color: 'rgb(var(--text-muted))', textTransform: 'uppercase',
          marginBottom: 14,
        }}>
          Step {step + 1} of {STEPS.length}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 22 }}>
          <div
            style={{
              flex: 1,
              position: 'relative',
              background: '#FFFFFF',
              border: '2.5px solid #1B1A17',
              borderRadius: 16,
              padding: '14px 18px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            }}
          >
            <p className="font-heading font-bold text-base leading-snug" style={{ color: '#1B1A17', margin: 0 }}>
              {current.emoji} {current.title}
            </p>
            <p style={{ fontSize: 13, marginTop: 6, color: 'rgba(27,26,23,0.70)', lineHeight: 1.5, margin: '6px 0 0' }}>
              {current.body}
            </p>
            {/* Tail pointing right toward Pixelman */}
            <div
              style={{
                position: 'absolute', right: -10, top: 28,
                width: 16, height: 16,
                background: '#FFFFFF',
                borderRight: '2.5px solid #1B1A17',
                borderBottom: '2.5px solid #1B1A17',
                transform: 'rotate(-45deg)',
              }}
            />
          </div>

          <div style={{ animation: 'ct-float 2.4s ease-in-out infinite', flexShrink: 0 }}>
            <PixelMan px={10} tilt={8} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === step ? 18 : 7,
                height: 7,
                borderRadius: 999,
                background: i === step ? '#1B1A17' : 'rgb(var(--border-strong))',
                transition: 'width 200ms ease, background 200ms ease',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="btn-secondary text-sm font-semibold"
              style={{ padding: '9px 18px', borderRadius: 10 }}
            >
              Back
            </button>
          )}
          {isLast ? (
            <button
              onClick={() => finish('complete')}
              className="btn-primary text-sm font-semibold"
              style={{ padding: '9px 22px', borderRadius: 10 }}
            >
              Let's paint! →
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="btn-primary text-sm font-semibold"
              style={{ padding: '9px 22px', borderRadius: 10 }}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CanvasTutorial;
