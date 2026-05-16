import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import WalletInfo from './WalletInfo';
import ThemeToggle from './ThemeToggle';
import { useSocket } from '../hooks/useSocket';
import { useApp } from '../context/AppContext';

const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS;

function formatCountdown(msLeft) {
  if (msLeft <= 0) return 'ended';
  const totalSeconds = Math.floor(msLeft / 1000);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

const EpochChip = ({ epochInfo }) => {
  const [msLeft, setMsLeft] = useState(0);

  useEffect(() => {
    if (!epochInfo.endsAt) { setMsLeft(0); return; }
    const tick = () => setMsLeft(Math.max(0, epochInfo.endsAt - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [epochInfo.endsAt]);

  if (!epochInfo.epoch) return null;

  return (
    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-backgroundAlt border border-border text-xs font-medium text-textSecondary">
      <span className="text-primary font-semibold">Epoch {epochInfo.epoch}</span>
      {epochInfo.endsAt > 0 && (
        <>
          <span className="text-border">•</span>
          <span>{formatCountdown(msLeft)}</span>
        </>
      )}
    </div>
  );
};

/**
 * Header — sticky navigation for authenticated pages (Shop, Canvas).
 *
 * Layout: logo on the left, connection status + wallet info on the right.
 * Minimal, neutral, blends into the warm cream background.
 */
const Header = () => {
  const { isConnected } = useSocket();
  const { wallet, epochInfo } = useApp();
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
          {/* Epoch countdown */}
          <EpochChip epochInfo={epochInfo} />

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
