import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import MarketingNav from '../components/MarketingNav';
import ColorPicker from '../components/ColorPicker';
import Canvas from '../components/Canvas';
import Toolbar from '../components/Toolbar';
import ReferenceImage from '../components/ReferenceImage';
import RefImageHandle from '../components/RefImageHandle';
import CanvasTutorial from '../components/CanvasTutorial';
import { useApp } from '../context/AppContext';

/**
 * CanvasPage - Main gameplay screen
 *
 * Layout:
 * - Header (top)
 * - Grid: [ColorPicker] [Canvas] [Toolbar]
 *
 * Features:
 * - Protected route (requires wallet connection)
 * - Real-time collaborative painting
 * - Toast notifications
 */

const CanvasPage = () => {
  const { isConnected } = useWallet();
  const { toast, dismissToast, epochInfo, showToast, refetchEpochInfo, refetchVotingState } = useApp();
  const navigate = useNavigate();

  // Lock page scroll while on the canvas route; restore on leave.
  useEffect(() => {
    document.body.classList.add('canvas-page-active');
    return () => document.body.classList.remove('canvas-page-active');
  }, []);

  // Once-per-session PixelMan walkthrough of the canvas menu. Runs only
  // here (on /canvas) so brand-new users see it the first time they
  // actually look at the tools. `canvas_tutorial_seen` flag in
  // sessionStorage keeps it from re-appearing during the same tab session.
  const [tutorialOpen, setTutorialOpen] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('canvas_tutorial_seen') !== '1') {
        setTutorialOpen(true);
      }
    } catch (_) {
      // sessionStorage blocked (private mode) — show the tour anyway.
      setTutorialOpen(true);
    }
  }, []);
  const closeTutorial = () => setTutorialOpen(false);

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      navigate('/login');
    }
  }, [isConnected, navigate]);

  // Fire a one-shot toast when the current epoch ends
  const lastFiredEpochRef = useRef(null);
  useEffect(() => {
    if (!epochInfo?.endsAt || epochInfo.endsAt <= 0) return;
    const id = setInterval(() => {
      if (
        Date.now() >= epochInfo.endsAt &&
        lastFiredEpochRef.current !== epochInfo.epoch
      ) {
        lastFiredEpochRef.current = epochInfo.epoch;
        showToast(`Epoch ${epochInfo.epoch} ended! Refreshing for the new round…`, 'success');
        refetchEpochInfo();
        refetchVotingState();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [epochInfo?.endsAt, epochInfo?.epoch]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <MarketingNav />

      {/* Main Content: ColorPicker | Canvas | Toolbar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar: Color Picker first (always visible), Reference Image below.
            Swapped order so uploading a reference image never pushes the
            ColorPicker out of view — it expands downward, not upward. */}
        <div className="flex-shrink-0 h-full min-h-0 p-4 flex flex-col gap-3 items-start overflow-y-auto">
          <ColorPicker />
          <ReferenceImage />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden min-w-0">
          <Canvas />
          <RefImageHandle />
        </div>

        {/* Right Sidebar: Toolbar */}
        <div className="flex-shrink-0 h-full min-h-0 p-4 flex flex-col items-end gap-3 overflow-y-auto">
          <Toolbar />
        </div>
      </div>

      {/* First-time canvas tutorial — PixelMan walks the user through the
          left/right panels. Skipping and finishing both behave identically:
          dismiss + persist the seen flag in sessionStorage. */}
      <CanvasTutorial
        open={tutorialOpen}
        onComplete={closeTutorial}
        onSkip={closeTutorial}
      />

      {/* Toast Notifications */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 animate-slide-up max-w-sm">
          <div
            className={`px-4 py-3 rounded-lg border shadow-elevate bg-surface ${
              toast.type === 'success'
                ? 'border-success/40'
                : toast.type === 'error'
                  ? 'border-error/40'
                  : 'border-primary/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-base mt-0.5">
                  {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
                </span>
                <p className={`text-sm font-medium ${
                  toast.type === 'success' ? 'text-success'
                  : toast.type === 'error' ? 'text-error'
                  : 'text-textPrimary'
                }`}>
                  {toast.message}
                </p>
              </div>
              <button
                onClick={dismissToast}
                className="text-textMuted hover:text-textPrimary transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CanvasPage;
