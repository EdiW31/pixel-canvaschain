import { Link } from 'react-router-dom';
import WalletInfo from './WalletInfo';
import ThemeToggle from './ThemeToggle';
import { useSocket } from '../hooks/useSocket';
import { useApp } from '../context/AppContext';

const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS;

/**
 * Header — sticky navigation for authenticated pages (Shop, Canvas).
 *
 * Layout: logo on the left, connection status + wallet info on the right.
 * Minimal, neutral, blends into the warm cream background.
 */
const Header = () => {
  const { isConnected } = useSocket();
  const { wallet } = useApp();
  const isAdmin = wallet.address === ADMIN_ADDRESS;

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-lg shadow-soft">
            🎨
          </div>
          <div className="leading-tight">
            <div className="font-heading text-lg font-semibold tracking-tight">
              Pixel CanvasChain
            </div>
            <div className="text-xs text-textMuted">Painting for a cause</div>
          </div>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Live connection indicator */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-textMuted">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-success animate-subtle-pulse' : 'bg-error'
              }`}
            />
            <span>{isConnected ? 'Live' : 'Offline'}</span>
          </div>

          {isAdmin && (
            <Link
              to="/admin"
              className="px-3 py-1.5 rounded-lg bg-primary text-textPrimary text-sm font-semibold border border-primaryDark/40 shadow-soft hover:bg-primaryDark transition-colors"
            >
              ⚙ Admin
            </Link>
          )}
          <WalletInfo />
          <div className="w-px h-5 bg-border flex-shrink-0" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Header;
