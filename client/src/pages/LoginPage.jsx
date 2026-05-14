import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';

/**
 * LoginPage — MultiversX wallet connection screen.
 *
 * Triggers sdk-dapp's UnlockPanel (web component) which handles
 * the actual provider picker UI off-document.
 */
const LoginPage = () => {
  const { isConnected, openLogin } = useWallet();
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (isConnected) navigate('/shop');
  }, [isConnected, navigate]);

  const handleConnect = () => {
    setIsConnecting(true);
    openLogin(
      () => setIsConnecting(false),
      () => setIsConnecting(false),
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal top bar with back link */}
      <nav className="px-6 py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-textSecondary hover:text-textPrimary transition-colors">
          <span>←</span>
          <span>Back to home</span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 pb-20">
        <div className="w-full max-w-md animate-slide-up">
          {/* Card */}
          <div className="card p-8 sm:p-10">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-primary mx-auto mb-6 flex items-center justify-center text-2xl shadow-soft">
              🎨
            </div>

            {/* Title */}
            <h1 className="font-heading text-3xl font-semibold text-center tracking-tight mb-2">
              Welcome back
            </h1>
            <p className="text-center text-textSecondary mb-8">
              Connect a MultiversX wallet to start painting.
            </p>

            {/* Connect button */}
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className={`w-full btn-primary-lg ${isConnecting ? 'opacity-70 cursor-wait' : ''}`}
            >
              {isConnecting ? (
                <>
                  <Spinner /> Opening wallet picker…
                </>
              ) : (
                'Connect wallet'
              )}
            </button>

            {/* Supported wallets */}
            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-xs uppercase tracking-wider text-textMuted font-semibold mb-3 text-center">
                Supported wallets
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-textSecondary">
                <WalletItem icon="🦊" name="DeFi Extension" />
                <WalletItem icon="📱" name="xPortal (QR)" />
                <WalletItem icon="🌐" name="Web Wallet" />
                <WalletItem icon="🔑" name="Ledger" />
              </div>
            </div>
          </div>

          {/* Network notice */}
          <p className="text-center text-xs text-textMuted mt-6">
            Currently running on <strong className="text-textSecondary font-medium">MultiversX Devnet</strong> — test wallet only.
          </p>
        </div>
      </div>
    </div>
  );
};

const Spinner = () => (
  <span className="inline-block w-4 h-4 border-2 border-textPrimary/40 border-t-textPrimary rounded-full animate-spin" />
);

const WalletItem = ({ icon, name }) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-backgroundAlt">
    <span>{icon}</span>
    <span>{name}</span>
  </div>
);

export default LoginPage;
