import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useApp } from '../context/AppContext';
import ShopCard from '../components/ShopCard';
import Header from '../components/Header';

/**
 * ShopPage — Credit purchase screen (Phase 2, devnet)
 *
 * Tier costs are real xEGLD amounts for MultiversX devnet.
 * Each card triggers a real on-chain buyPixels transaction in ShopCard.
 */

// Devnet tier definitions — match contract constants in pixel_canvas_contract.rs
const TIERS = [
  { name: 'Novice',     cost: 0.05, basePixels: 1000,  bonusPixels: 0,     total: 1000,  bonusPercent: 0  },
  { name: 'Apprentice', cost: 0.25, basePixels: 5000,  bonusPixels: 500,   total: 5500,  bonusPercent: 10 },
  { name: 'Artisan',    cost: 0.50, basePixels: 10000, bonusPixels: 2000,  total: 12000, bonusPercent: 20 },
  { name: 'Master',     cost: 1.25, basePixels: 25000, bonusPixels: 7500,  total: 32500, bonusPercent: 30 },
  { name: 'Legend',     cost: 2.50, basePixels: 50000, bonusPixels: 25000, total: 75000, bonusPercent: 50, badge: 'Best value' },
];

const ShopPage = () => {
  const { isConnected } = useWallet();
  const { wallet, refetchCredits } = useApp();
  const navigate = useNavigate();
  const credits = wallet.credits;

  useEffect(() => {
    if (!isConnected) navigate('/login');
  }, [isConnected, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Page header */}
        <div className="mb-10 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-8">
            <div>
              <div className="pill-charity mb-3">
                <span>♥</span>
                50% of every purchase → child welfare charity
              </div>
              <h1 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight mb-3">
                Buy painting credits
              </h1>
              <p className="text-textSecondary max-w-xl">
                Each credit lets you place one pixel on the canvas. Higher tiers come with bonus pixels — and a bigger contribution to charity.
              </p>
            </div>

            {credits > 0 && (
              <button
                onClick={() => navigate('/canvas')}
                className="btn-primary-lg whitespace-nowrap"
              >
                Start painting →
              </button>
            )}
          </div>

          {/* Balance strip */}
          <div className="card p-5 flex flex-wrap items-center gap-x-8 gap-y-3">
            <BalanceItem label="Wallet balance" value={wallet.egld} unit="EGLD" />
            <Divider />
            <BalanceItem label="Credits" value={credits.toLocaleString()} unit="pixels" emphasis />
            <button
              onClick={refetchCredits}
              title="Force a fresh on-chain query"
              className="ml-auto btn-ghost text-sm"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TIERS.map((tier) => (
            <ShopCard key={tier.name} tier={tier} />
          ))}
        </div>

        {/* Info row */}
        <div className="mt-16 grid md:grid-cols-3 gap-5">
          <InfoCard
            tag="On-chain"
            title="The split is enforced by code"
            body="Charity, owner, and burn allocations happen inside the same transaction that credits your pixels. No escrow, no delay."
          />
          <InfoCard
            tag="Transparent"
            title="Every donation is public"
            body="The contract emits an event on every purchase. Total donated is queryable by anyone via getTotalDonated()."
            charity
          />
          <InfoCard
            tag="Forever"
            title="Your art lives on the chain"
            body="Once placed, your pixel is part of a public, indexed canvas — even if our servers disappear, the contract state persists."
          />
        </div>
      </main>
    </div>
  );
};

const BalanceItem = ({ label, value, unit, emphasis }) => (
  <div>
    <div className="text-xs text-textMuted mb-1 uppercase tracking-wider font-medium">{label}</div>
    <div className="flex items-baseline gap-2">
      <span className={`text-2xl font-semibold ${emphasis ? 'text-charityDark' : 'text-textPrimary'}`}>{value}</span>
      <span className="text-xs text-textMuted">{unit}</span>
    </div>
  </div>
);

const Divider = () => <div className="hidden sm:block w-px h-10 bg-border" />;

const InfoCard = ({ tag, title, body, charity }) => (
  <div className="card p-6">
    <div className={charity ? 'pill-charity mb-3' : 'pill mb-3'}>{tag}</div>
    <h3 className="font-heading text-lg font-semibold mb-2">{title}</h3>
    <p className="text-sm text-textSecondary leading-relaxed">{body}</p>
  </div>
);

export default ShopPage;
