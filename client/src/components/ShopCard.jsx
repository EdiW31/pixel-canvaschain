import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useSocket } from '../hooks/useSocket';

/**
 * ShopCard - Individual tier card component
 *
 * Props:
 * - tier: { name, cost, basePixels, bonusPixels, total, bonusPercent, color, badge }
 *
 * Features:
 * - Displays tier info with bonus percentage
 * - Shows "Best Value" badge for Legend tier
 * - Purchase button with loading state
 * - Disabled state if insufficient EGLD
 * - Tier-specific colors and hover effects
 *
 * [FUTURE: Show gas estimation before purchase]
 * [FUTURE: Display transaction hash after purchase]
 */

const ShopCard = ({ tier }) => {
  const { wallet, showToast } = useApp();
  const { purchaseCredits } = useSocket();
  const [isPurchasing, setIsPurchasing] = useState(false);

  const canAfford = wallet.egld >= tier.cost;
  const isLegend = tier.name === 'Legend';

  /**
   * Handle purchase click
   * [FUTURE: Sign transaction with wallet before submitting]
   */
  const handlePurchase = async () => {
    if (!wallet.isConnected) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    if (!canAfford) {
      showToast(`Insufficient EGLD. Need ${tier.cost}, have ${wallet.egld}`, 'error');
      return;
    }

    setIsPurchasing(true);

    // Emit purchase request (server will simulate 2s delay)
    purchaseCredits(tier.name);

    // Keep loading state for 2.5 seconds (2s transaction + 0.5s buffer)
    setTimeout(() => {
      setIsPurchasing(false);
    }, 2500);
  };

  return (
    <div
      className={`relative bg-surface rounded-lg border-2 p-6 transition-all duration-300 hover:scale-105 ${
        isLegend
          ? 'border-secondary shadow-neon-magenta'
          : 'border-primary/30 hover:border-primary hover:shadow-neon-cyan'
      }`}
      style={{
        backgroundColor: isLegend ? 'rgba(255, 0, 255, 0.05)' : undefined,
      }}
    >
      {/* Best Value Badge */}
      {tier.badge && (
        <div className="absolute -top-3 -right-3 bg-secondary border-2 border-secondary rounded-full px-3 py-1 shadow-neon-magenta">
          <p className="text-xs font-bold text-background">{tier.badge}</p>
        </div>
      )}

      {/* Tier Name */}
      <h3
        className={`text-2xl font-heading font-bold mb-4 ${
          isLegend ? 'text-secondary' : 'text-primary'
        }`}
      >
        {tier.name}
      </h3>

      {/* Cost */}
      <div className="mb-4">
        <div className="flex items-baseline space-x-2">
          <span className="text-4xl font-bold text-accent">{tier.cost}</span>
          <span className="text-textSecondary">EGLD</span>
        </div>
      </div>

      {/* Credits Breakdown */}
      <div className="space-y-2 mb-6">
        <div className="flex justify-between text-sm">
          <span className="text-textSecondary">Base Credits:</span>
          <span className="text-textPrimary font-bold">
            {tier.basePixels.toLocaleString()}
          </span>
        </div>

        {tier.bonusPixels > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-success">
              Bonus (+{tier.bonusPercent}%):
            </span>
            <span className="text-success font-bold">
              +{tier.bonusPixels.toLocaleString()}
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-primary/20">
          <div className="flex justify-between">
            <span className="text-textPrimary font-bold">Total Credits:</span>
            <span
              className={`text-xl font-bold ${
                isLegend ? 'text-secondary' : 'text-primary'
              }`}
            >
              {tier.total.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Value per Credit */}
      <div className="mb-4 p-3 bg-background/50 rounded border border-primary/10">
        <p className="text-xs text-textSecondary text-center">
          {(tier.cost / tier.total).toFixed(4)} EGLD per credit
        </p>
      </div>

      {/* Purchase Button */}
      <button
        onClick={handlePurchase}
        disabled={!canAfford || isPurchasing}
        className={`w-full py-3 rounded-lg font-bold text-sm transition-all duration-300 ${
          isPurchasing
            ? 'bg-accent/20 text-accent cursor-wait'
            : canAfford
            ? isLegend
              ? 'bg-secondary/10 border-2 border-secondary text-secondary hover:bg-secondary hover:text-background'
              : 'bg-primary/10 border-2 border-primary text-primary hover:bg-primary hover:text-background'
            : 'bg-surface border-2 border-error/30 text-error/50 cursor-not-allowed'
        }`}
      >
        {isPurchasing ? (
          <span className="flex items-center justify-center space-x-2">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span>Processing...</span>
          </span>
        ) : canAfford ? (
          'Purchase'
        ) : (
          'Insufficient EGLD'
        )}
      </button>
    </div>
  );
};

export default ShopCard;
