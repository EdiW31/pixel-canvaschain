import { Link } from 'react-router-dom';
import WalletInfo from './WalletInfo';
import { useSocket } from '../hooks/useSocket';

/**
 * Header - Navigation header component
 *
 * Displays:
 * - Logo/Brand
 * - Wallet connection status
 * - Navigation links (if wallet connected)
 * - Connection indicator
 */

const Header = () => {
  const { isConnected } = useSocket();

  return (
    <header className="bg-surface border-b border-primary/20 px-6 py-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center space-x-3 group">
          <div className="w-10 h-10 bg-gradient-to-br from-primary via-secondary to-accent rounded-lg flex items-center justify-center">
            <span className="text-2xl">🎨</span>
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold text-primary group-hover:text-secondary transition-colors">
              PIXEL CANVASCHAIN
            </h1>
            <p className="text-xs text-textSecondary">Decentralized Philanthropic Art</p>
          </div>
        </Link>

        {/* Right Side: Wallet Info + Connection Status */}
        <div className="flex items-center space-x-4">
          {/* Connection Indicator */}
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-success animate-pulse' : 'bg-error'
              }`}
            />
            <span className="text-sm text-textSecondary">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Wallet Info */}
          <WalletInfo />
        </div>
      </div>
    </header>
  );
};

export default Header;
