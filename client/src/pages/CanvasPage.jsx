import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import Header from '../components/Header';
import ColorPicker from '../components/ColorPicker';
import Canvas from '../components/Canvas';
import Toolbar from '../components/Toolbar';
import ReferenceImage from '../components/ReferenceImage';
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
  const { toast, dismissToast } = useApp();
  const navigate = useNavigate();

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      navigate('/login');
    }
  }, [isConnected, navigate]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <Header />

      {/* Main Content: ColorPicker | Canvas | Toolbar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar: Color Picker */}
        <div className="flex-shrink-0 p-4 flex items-center">
          <ColorPicker />
        </div>

        {/* Center: Canvas (relative so ReferenceImage can position over it) */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden min-w-0">
          <Canvas />
          <ReferenceImage />
        </div>

        {/* Right Sidebar: Toolbar */}
        <div className="flex-shrink-0 p-4 flex items-center">
          <Toolbar />
        </div>
      </div>

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
