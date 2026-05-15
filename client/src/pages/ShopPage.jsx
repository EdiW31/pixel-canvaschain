import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useApp } from '../context/AppContext';
import ShopCard from '../components/ShopCard';
import Header from '../components/Header';
import { Dot, Stroke, PaletteStrip } from '../components/PaintDecorations';

// Devnet tier definitions — match contract constants in pixel_canvas_contract.rs
const TIERS = [
  { name: 'Novice',     cost: 0.05, basePixels: 1000,  bonusPixels: 0,     total: 1000,  bonusPercent: 0,  dot: '#9F7AEA' },
  { name: 'Apprentice', cost: 0.25, basePixels: 5000,  bonusPixels: 500,   total: 5500,  bonusPercent: 10, dot: '#4299E1' },
  { name: 'Artisan',    cost: 0.50, basePixels: 10000, bonusPixels: 2000,  total: 12000, bonusPercent: 20, dot: '#48BB78' },
  { name: 'Master',     cost: 1.25, basePixels: 25000, bonusPixels: 7500,  total: 32500, bonusPercent: 30, dot: '#ED8936' },
  { name: 'Legend',     cost: 2.50, basePixels: 50000, bonusPixels: 25000, total: 75000, bonusPercent: 50, dot: '#E53E3E', badge: 'Best value' },
];

// Info card accent colours
const INFO_COLORS = ['#4299E1', '#48BB78', '#9F7AEA'];

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

        {/* ─── Page header ─────────────────────────────────────────── */}
        <div className="mb-10 animate-fade-in">
          <div className="relative overflow-hidden rounded-2xl bg-backgroundAlt border border-border px-8 pt-10 pb-8 mb-8">
            {/* Paint-drop decorations */}
            <Dot color="#E53E3E" style={{ top: 18,  left:  '4%'  }} />
            <Dot color="#4299E1" style={{ top: 40,  right: '6%'  }} />
            <Dot color="#48BB78" style={{ bottom: 20, left: '60%' }} />
            <Dot color="#9F7AEA" style={{ top: 60,  right: '20%' }} />
            <Dot color="#ED8936" style={{ bottom: 30, left: '30%' }} />

            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
              <div>
                <div className="pill-charity mb-3 inline-flex">
                  <span>♥</span> 50% of every purchase → child welfare charity
                </div>
                <h1 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight mb-2">
                  Buy painting credits
                </h1>
                <Stroke />
                <p className="text-textSecondary max-w-xl">
                  Each credit lets you place one pixel on the canvas. Higher tiers come with
                  bonus pixels — and a bigger contribution to charity.
                </p>
                <div className="mt-4">
                  <PaletteStrip size={12} />
                </div>
              </div>

              {credits > 0 && (
                <button onClick={() => navigate('/canvas')} className="btn-primary-lg whitespace-nowrap flex-shrink-0">
                  Start painting →
                </button>
              )}
            </div>
          </div>

          {/* Balance strip */}
          <div className="card p-5 flex flex-wrap items-center gap-x-8 gap-y-3">
            <BalanceItem label="Wallet balance" value={wallet.egld} unit="EGLD" />
            <Divider />
            <BalanceItem label="Credits" value={credits.toLocaleString()} unit="pixels" emphasis />
            <button onClick={refetchCredits} title="Force a fresh on-chain query" className="ml-auto btn-ghost text-sm">
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* ─── Tier cards ──────────────────────────────────────────── */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TIERS.map((tier) => (
            <ShopCard key={tier.name} tier={tier} accentColor={tier.dot} />
          ))}
        </div>

        {/* ─── Info row ────────────────────────────────────────────── */}
        <div className="mt-16 grid md:grid-cols-3 gap-5">
          <InfoCard
            accent={INFO_COLORS[0]}
            tag="On-chain"
            title="The split is enforced by code"
            body="Charity, owner, and burn allocations happen inside the same transaction that credits your pixels. No escrow, no delay."
          />
          <InfoCard
            accent={INFO_COLORS[1]}
            tag="Transparent"
            title="Every donation is public"
            body="The contract emits an event on every purchase. Total donated is queryable by anyone via getTotalDonated()."
            charity
          />
          <InfoCard
            accent={INFO_COLORS[2]}
            tag="Forever"
            title="Your art lives on the chain"
            body="Once placed, your pixel is part of a public, indexed canvas — even if our servers disappear, the contract state persists."
          />
        </div>
      </main>
    </div>
  );
};

/* ─── Sub-components ──────────────────────────────────────────────────────── */

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

const InfoCard = ({ accent, tag, title, body, charity }) => (
  <div className="card p-6 overflow-hidden relative">
    {/* Coloured top bar */}
    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: accent }} />
    <div className={`${charity ? 'pill-charity' : 'pill'} mb-3 mt-2`}>{tag}</div>
    <h3 className="font-heading text-lg font-semibold mb-2">{title}</h3>
    <p className="text-sm text-textSecondary leading-relaxed">{body}</p>
  </div>
);

export default ShopPage;
