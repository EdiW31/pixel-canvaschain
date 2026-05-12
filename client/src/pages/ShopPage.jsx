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
 * Purchases are sent as real EGLD transactions to the smart contract.
 */

// Devnet tier definitions — match pixel-canvas-contract/src/pixel_canvas_contract.rs constants
const TIERS = [
  {
    name: 'Novice',
    cost: 0.05,         // xEGLD
    basePixels: 1000,
    bonusPixels: 0,
    total: 1000,
    bonusPercent: 0,
    color: '#3b82f6',
  },
  {
    name: 'Apprentice',
    cost: 0.25,
    basePixels: 5000,
    bonusPixels: 500,
    total: 5500,
    bonusPercent: 10,
    color: '#00ffff',
  },
  {
    name: 'Artisan',
    cost: 0.5,
    basePixels: 10000,
    bonusPixels: 2000,
    total: 12000,
    bonusPercent: 20,
    color: '#a855f7',
  },
  {
    name: 'Master',
    cost: 1.25,
    basePixels: 25000,
    bonusPixels: 7500,
    total: 32500,
    bonusPercent: 30,
    color: '#fbbf24',
  },
  {
    name: 'Legend',
    cost: 2.5,
    basePixels: 50000,
    bonusPixels: 25000,
    total: 75000,
    bonusPercent: 50,
    color: 'linear-gradient(to right, #ff00ff, #00ffff, #ffff00)',
    badge: 'Best Value',
  },
];

const ShopPage = () => {
  const { isConnected } = useWallet();
  const { wallet, refetchCredits } = useApp();
  const navigate = useNavigate();
  const credits = wallet.credits;

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      navigate('/login');
    }
  }, [isConnected, navigate]);

  const handlePlayClick = () => {
    if (credits > 0) {
      navigate('/canvas');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-heading font-bold text-primary mb-2">
                Purchase Credits
              </h1>
              <p className="text-textSecondary">
                Choose a tier to get painting credits. Higher tiers offer bonus pixels!
              </p>
            </div>

            {/* Play Button */}
            <button
              onClick={handlePlayClick}
              disabled={credits <= 0}
              className={`px-8 py-3 rounded-lg font-bold text-lg transition-all duration-300 ${
                credits > 0
                  ? 'bg-success border-2 border-success text-background hover:bg-transparent hover:text-success shadow-neon-green animate-pulse-glow'
                  : 'bg-surface border-2 border-textSecondary/30 text-textSecondary/50 cursor-not-allowed'
              }`}
            >
              {credits > 0 ? '🎨 Start Painting' : '🔒 Buy Credits First'}
            </button>
          </div>

          {/* Balance Display */}
          <div className="flex items-center space-x-4 p-4 bg-surface border border-primary/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <span className="text-textSecondary">Your Balance:</span>
              <span className="text-xl font-bold text-accent">{wallet.egld}</span>
              <span className="text-textSecondary">EGLD</span>
            </div>
            <div className="w-px h-6 bg-primary/30" />
            <div className="flex items-center space-x-2">
              <span className="text-textSecondary">Credits:</span>
              <span className="text-xl font-bold text-primary">
                {credits.toLocaleString()}
              </span>
              <button
                onClick={refetchCredits}
                title="Refresh credits from chain"
                className="ml-1 text-textSecondary hover:text-primary transition-colors text-sm"
              >
                ↻
              </button>
            </div>
          </div>
        </div>

        {/* Tier Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TIERS.map((tier) => (
            <ShopCard key={tier.name} tier={tier} />
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="bg-surface border border-primary/20 rounded-lg p-6">
            <h3 className="text-lg font-heading font-bold text-primary mb-2">
              💰 How it Works
            </h3>
            <p className="text-sm text-textSecondary">
              Purchase credits with EGLD. Each credit lets you paint 1 pixel on the canvas.
              Higher tiers give you bonus credits!
            </p>
          </div>

          <div className="bg-surface border border-secondary/20 rounded-lg p-6">
            <h3 className="text-lg font-heading font-bold text-secondary mb-2">
              ❤️ 50% to Charity
            </h3>
            <p className="text-sm text-textSecondary">
              Every purchase automatically sends 50% to child welfare charities via the
              smart contract. Paint for a cause!
            </p>
          </div>

          <div className="bg-surface border border-accent/20 rounded-lg p-6">
            <h3 className="text-lg font-heading font-bold text-accent mb-2">
              🔮 Future: NFTs
            </h3>
            <p className="text-sm text-textSecondary">
              Top contributors will receive AI-generated NFT airdrops based on the final canvas
              art!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopPage;
