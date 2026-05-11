import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';

/**
 * LoginPage — MultiversX wallet connection screen (Phase 2)
 *
 * Uses sdk-dapp v5 UnlockPanelManager to open the wallet picker.
 * Supports: DeFi Browser Extension, xPortal (WalletConnect), Web Wallet, Ledger.
 * Auto-redirects to /shop after successful login.
 */

const LoginPage = () => {
  const { isConnected, openLogin } = useWallet();
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);

  // Redirect if already connected
  useEffect(() => {
    if (isConnected) {
      navigate('/shop');
    }
  }, [isConnected, navigate]);

  const handleConnect = () => {
    setIsConnecting(true);
    openLogin(
      () => {
        // onSuccess — sdk-dapp Zustand store updates; useEffect above will redirect
        setIsConnecting(false);
      },
      () => {
        // onClose — user dismissed the panel without logging in
        setIsConnecting(false);
      },
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-surface flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Card */}
        <div className="bg-surface border-2 border-primary/30 rounded-lg p-8 shadow-neon-cyan">
          {/* Header */}
          <div className="text-center mb-8">
            {/* Wallet Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-primary/10 border-2 border-primary rounded-full flex items-center justify-center">
                <span className="text-4xl">💼</span>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-primary mb-2">
              Connect Wallet
            </h2>
            <p className="text-sm text-textSecondary">
              Connect your MultiversX wallet to start painting on the canvas
            </p>
          </div>

          {/* Connect Button */}
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className={`w-full py-4 rounded-lg font-bold text-lg transition-all duration-300 ${
              isConnecting
                ? 'bg-primary/20 text-primary cursor-wait'
                : 'bg-primary border-2 border-primary text-background hover:bg-transparent hover:text-primary shadow-neon-cyan'
            }`}
          >
            {isConnecting ? (
              <span className="flex items-center justify-center space-x-3">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Connecting...</span>
              </span>
            ) : (
              'Connect Wallet'
            )}
          </button>

          {/* Supported Wallets Info */}
          <div className="mt-6 p-4 bg-background/50 rounded border border-primary/10">
            <p className="text-xs text-textSecondary leading-relaxed font-bold mb-2">
              Supported wallets:
            </p>
            <ul className="text-xs text-textSecondary space-y-1">
              <li>🦊 <span className="text-primary">DeFi Browser Extension</span></li>
              <li>📱 <span className="text-primary">xPortal Mobile App</span> (via QR)</li>
              <li>🌐 <span className="text-primary">MultiversX Web Wallet</span></li>
              <li>🔑 <span className="text-primary">Ledger Hardware Wallet</span></li>
            </ul>
          </div>

          {/* Loading Animation */}
          {isConnecting && (
            <div className="mt-6 text-center">
              <div className="inline-flex space-x-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-xs text-textSecondary mt-2">
                Opening wallet picker...
              </p>
            </div>
          )}
        </div>

        {/* Back Link */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-textSecondary hover:text-primary transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
