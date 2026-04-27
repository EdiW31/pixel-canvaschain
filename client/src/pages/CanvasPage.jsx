import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMockWallet } from '../hooks/useMockWallet';
import Header from '../components/Header';
import ColorPicker from '../components/ColorPicker';
import Canvas from '../components/Canvas';
import Toolbar from '../components/Toolbar';
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
  const { isConnected } = useMockWallet();
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

        {/* Center: Canvas */}
        <div className="flex-1 flex items-center justify-center overflow-hidden min-w-0">
          <Canvas />
        </div>

        {/* Right Sidebar: Toolbar */}
        <div className="flex-shrink-0 p-4 flex items-center">
          <Toolbar />
        </div>
      </div>

      {/* Toast Notifications */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 animate-slide-in">
          <div
            className={`px-6 py-4 rounded-lg border-2 shadow-lg ${
              toast.type === 'success'
                ? 'bg-success/10 border-success text-success'
                : toast.type === 'error'
                ? 'bg-error/10 border-error text-error'
                : 'bg-primary/10 border-primary text-primary'
            }`}
          >
            <div className="flex items-center justify-between space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-xl">
                  {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
                </span>
                <p className="text-sm font-medium">{toast.message}</p>
              </div>
              <button
                onClick={dismissToast}
                className="text-lg hover:opacity-70 transition-opacity"
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
