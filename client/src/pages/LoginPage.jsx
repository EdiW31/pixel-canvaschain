import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import MarketingNav from '../components/MarketingNav';
import { Dot, Stroke, PaletteStrip } from '../components/PaintDecorations';

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

      <MarketingNav />

      <div className="flex-1 grid lg:grid-cols-2 gap-12 max-w-6xl mx-auto w-full px-6 pb-20 items-center">

        {/* ─── LEFT: brand + mini canvas ──────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-8 animate-fade-in">

          {/* Header */}
          <div className="relative">
            <Dot color="#E53E3E" style={{ top: -10, left: '70%' }} />
            <Dot color="#4299E1" style={{ top: 30,  left: '80%' }} />
            <Dot color="#48BB78" style={{ top: 10,  left: '-2%' }} />

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-2xl shadow-card">🎨</div>
              <PaletteStrip size={11} />
            </div>

            <h1 className="font-heading text-5xl font-semibold tracking-tight leading-tight mb-3">
              Connect your<br />
              <span className="italic text-primaryDark">MultiversX wallet</span><br />
              to start painting.
            </h1>
            <Stroke color="#4299E1" />
            <p className="text-lg text-textSecondary leading-relaxed">
              Your wallet is your identity on Pixel CanvasChain. We never see
              your private keys — every transaction is signed in your wallet
              and broadcast straight to the chain.
            </p>
          </div>

          {/* Trust items */}
          <ul className="space-y-3 text-sm text-textSecondary">
            <TrustItem accent="#E53E3E">
              <strong className="text-textPrimary font-semibold">Zero account creation.</strong>{' '}
              No emails, no passwords, no KYC for testnet.
            </TrustItem>
            <TrustItem accent="#4299E1">
              <strong className="text-textPrimary font-semibold">Open-source smart contract.</strong>{' '}
              Every line is on devnet-explorer.
            </TrustItem>
            <TrustItem accent="#48BB78">
              <strong className="text-textPrimary font-semibold">Charity enforced by code.</strong>{' '}
              50% goes direct to the winning NGO each week.
            </TrustItem>
          </ul>

        </div>

        {/* ─── RIGHT: action card ──────────────────────────────────── */}
        <div className="w-full max-w-md mx-auto lg:mx-0 animate-slide-up">
          <div className="card p-8 sm:p-10 relative overflow-hidden">
            {/* Coloured top bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl"
              style={{ background: 'linear-gradient(90deg,#E53E3E,#ED8936,#ECC94B,#48BB78,#4299E1,#9F7AEA,#ED64A6)' }} />

            {/* Mobile-only mini-hero */}
            <div className="lg:hidden text-center mb-6 mt-2">
              <div className="w-14 h-14 rounded-2xl bg-primary mx-auto mb-4 flex items-center justify-center text-2xl shadow-soft">🎨</div>
              <h1 className="font-heading text-3xl font-semibold tracking-tight">Connect wallet</h1>
              <div className="flex justify-center mt-2"><PaletteStrip size={9} /></div>
            </div>

            <div className="hidden lg:block mb-6">
              <h2 className="font-heading text-2xl font-semibold mb-1">Welcome</h2>
              <p className="text-sm text-textSecondary">Pick a wallet to continue. We'll never ask for your seed phrase.</p>
            </div>

            {/* Connect button */}
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className={`w-full btn-primary-lg ${isConnecting ? 'opacity-70 cursor-wait' : ''}`}
            >
              {isConnecting ? (
                <><Spinner /> Opening wallet picker…</>
              ) : (
                <><PlugIcon /> Connect MultiversX wallet</>
              )}
            </button>

            {/* Supported wallets */}
            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-xs uppercase tracking-wider text-textMuted font-semibold mb-4 text-center">
                Supported wallets
              </p>
              <div className="grid grid-cols-2 gap-2">
                <WalletItem icon="🦊" name="DeFi Extension" hint="Chrome / Brave"  accent="#ED8936" />
                <WalletItem icon="📱" name="xPortal"        hint="QR code"         accent="#4299E1" />
                <WalletItem icon="🌐" name="Web Wallet"     hint="Browser-based"   accent="#48BB78" />
                <WalletItem icon="🔑" name="Ledger"         hint="Hardware"        accent="#9F7AEA" />
              </div>
            </div>

            <p className="mt-6 text-xs text-textMuted text-center leading-relaxed">
              Running on <span className="font-mono text-textSecondary">MultiversX Devnet</span> — test xEGLD only, no real-world value.
            </p>
          </div>

          {/* New to wallets? */}
          <details className="mt-5 group">
            <summary className="cursor-pointer text-sm text-textMuted hover:text-textSecondary text-center select-none transition-colors">
              ▸ New to MultiversX wallets?
            </summary>
            <div className="mt-3 p-4 bg-backgroundAlt rounded-lg text-sm text-textSecondary leading-relaxed">
              Easiest path: install the{' '}
              <a href="https://chrome.google.com/webstore/detail/multiversx-defi-wallet/dngmlblcodfobpdpecaadgfbcggfjfnm"
                target="_blank" rel="noopener noreferrer" className="text-primaryDark hover:underline font-medium">
                MultiversX DeFi Wallet Chrome extension
              </a>
              , create a fresh wallet, switch the extension to <span className="font-mono">Devnet</span>, then{' '}
              <a href="https://devnet-wallet.multiversx.com/dashboard"
                target="_blank" rel="noopener noreferrer" className="text-primaryDark hover:underline font-medium">
                grab free test xEGLD from the faucet
              </a>.
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

/* ─── Sub-components ──────────────────────────────────────────────────────── */

const Spinner = () => (
  <span className="inline-block w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
);

const PlugIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2v6M15 2v6M5 8h14v2a7 7 0 0 1-7 7 7 7 0 0 1-7-7V8zM12 17v5" />
  </svg>
);

const TrustItem = ({ children, accent }) => (
  <li className="flex items-start gap-3">
    <span
      className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: accent + '22', color: accent }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
    <span className="leading-relaxed">{children}</span>
  </li>
);

const WalletItem = ({ icon, name, hint, accent }) => (
  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-backgroundAlt border border-border hover:border-borderStrong transition-colors relative overflow-hidden group">
    <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: accent }} />
    <span className="text-xl">{icon}</span>
    <div className="leading-tight min-w-0">
      <div className="text-sm font-medium text-textPrimary truncate">{name}</div>
      <div className="text-xs text-textMuted truncate">{hint}</div>
    </div>
  </div>
);

export default LoginPage;
