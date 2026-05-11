import { Link } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useApp } from '../context/AppContext';

/**
 * WalletInfo - Displays wallet connection status and balances
 *
 * Shows:
 * - Wallet address (truncated)
 * - EGLD balance
 * - Credit balance
 * - Link to shop (if connected)
 */

const WalletInfo = () => {
  const { isConnected, getTruncatedAddress, egld } = useWallet();
  const { wallet } = useApp();
  const credits = wallet.credits;

  if (!isConnected) {
    return (
      <Link
        to="/login"
        className="px-4 py-2 bg-primary/10 border border-primary rounded-lg text-primary hover:bg-primary hover:text-background transition-all duration-300"
      >
        Connect Wallet
      </Link>
    );
  }

  return (
    <div className="flex items-center space-x-4">
      {/* Wallet Address */}
      <div className="hidden md:flex items-center space-x-2 px-3 py-2 bg-surface border border-primary/30 rounded-lg">
        <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
        <span className="text-sm font-mono text-textPrimary">{getTruncatedAddress()}</span>
      </div>

      {/* Balances */}
      <div className="flex items-center space-x-3">
        {/* EGLD Balance */}
        <div className="flex items-center space-x-1 px-3 py-2 bg-accent/10 border border-accent rounded-lg">
          <span className="text-sm font-bold text-accent">{egld}</span>
          <span className="text-xs text-textSecondary">EGLD</span>
        </div>

        {/* Credits Balance */}
        <div className="flex items-center space-x-1 px-3 py-2 bg-primary/10 border border-primary rounded-lg">
          <span className="text-sm font-bold text-primary">{credits.toLocaleString()}</span>
          <span className="text-xs text-textSecondary">Credits</span>
        </div>
      </div>

      {/* Shop Link */}
      <Link
        to="/shop"
        className="px-4 py-2 bg-secondary/10 border border-secondary rounded-lg text-secondary hover:bg-secondary hover:text-background transition-all duration-300 text-sm font-bold"
      >
        Shop
      </Link>
    </div>
  );
};

export default WalletInfo;
