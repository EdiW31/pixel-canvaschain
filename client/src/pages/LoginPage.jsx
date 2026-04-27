import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMockWallet } from '../hooks/useMockWallet';

/**
 * LoginPage - Wallet connection screen
 *
 * Features:
 * - Centered card design
 * - "Connect Wallet" button
 * - Loading state with spinner
 * - Auto-redirect to /shop after success
 * - Displays generated wallet address
 *
 * [FUTURE: Replace with @multiversx/sdk-dapp ExtensionLogin component]
 * [FUTURE: Support multiple wallet types (xPortal, DeFi Wallet, Web Wallet, Ledger)]
 */

const LoginPage = () => {
  const { isConnected, isConnecting, connectWallet, getTruncatedAddress } = useMockWallet();
  const navigate = useNavigate();

  // Redirect if already connected
  useEffect(() => {
    if (isConnected) {
      navigate('/shop');
    }
  }, [isConnected, navigate]);

  const handleConnect = async () => {
    await connectWallet();
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
              Connect your wallet to start painting on the canvas
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
                <div className="w-5 h-5 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Connecting...</span>
              </span>
            ) : (
              'Connect Mock Wallet'
            )}
          </button>

          {/* Info */}
          <div className="mt-6 p-4 bg-background/50 rounded border border-primary/10">
            <p className="text-xs text-textSecondary leading-relaxed">
              <span className="text-accent font-bold">Phase 1:</span> This generates a mock{' '}
              <span className="font-mono text-primary">erd1...</span> address and assigns you{' '}
              <span className="text-accent font-bold">100 fake EGLD</span>.
            </p>
            <p className="text-xs text-textSecondary leading-relaxed mt-2">
              <span className="text-secondary font-bold">Future:</span> Real MultiversX wallet
              connection via xPortal, Browser Extension, or Web Wallet.
            </p>
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
                Generating wallet address...
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
