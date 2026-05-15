import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useApp } from '../context/AppContext';

/**
 * WalletInfo — header right-side widget.
 * - Disconnected: shows a single "Connect wallet" CTA.
 * - Connected:    shows address pill, EGLD, credits, Shop link, Disconnect.
 */
const WalletInfo = () => {
  const { isConnected, getTruncatedAddress, egld, logout } = useWallet();
  const { wallet } = useApp();
  const navigate = useNavigate();
  const credits = wallet.credits;

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!isConnected) {
    return (
      <Link to="/login" className="btn-primary">
        Connect wallet
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Address pill */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-backgroundAlt border border-border text-xs font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-success animate-subtle-pulse" />
        <span className="text-textSecondary">{getTruncatedAddress()}</span>
      </div>

      {/* EGLD */}
      <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primaryLight border border-primary/30 text-sm">
        <span className="font-semibold text-textPrimary">{egld}</span>
        <span className="text-textMuted text-xs">EGLD</span>
      </div>

      {/* Credits */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-charityLight border border-charity/30 text-sm">
        <span className="font-semibold text-textPrimary">{credits.toLocaleString()}</span>
        <span className="text-textMuted text-xs">credits</span>
      </div>

      {/* Shop */}
      <Link to="/shop" className="btn-ghost text-sm">
        Shop
      </Link>

      {/* Disconnect */}
      <button
        onClick={handleLogout}
        title="Disconnect wallet"
        className="px-3 py-1.5 text-sm text-textMuted hover:text-error hover:bg-error/5 rounded-md transition-colors"
      >
        ✕
      </button>
    </div>
  );
};

export default WalletInfo;
