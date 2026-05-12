import { useState } from 'react';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useApp } from '../context/AppContext';
import { getDappProvider } from '../hooks/useWallet';

/**
 * ShopCard — Individual tier card component (Phase 2)
 *
 * Props:
 *   tier: { name, cost, basePixels, bonusPixels, total, bonusPercent, color, badge? }
 *
 * On purchase:
 *  1. Build sdk-core Transaction (value in smallest EGLD units, data = "buyPixels")
 *  2. Sign via DappProvider — handles all provider types (Extension/xPortal/Web Wallet/Ledger)
 *     and refreshes the account nonce internally
 *  3. Broadcast via TransactionManager.send
 *  4. After 15 s, refetch on-chain credits
 */

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';

// Devnet tier values in smallest EGLD units (1 EGLD = 10^18)
const TIER_VALUES_WEI = {
  Novice:      50_000_000_000_000_000n,   // 0.05 EGLD
  Apprentice: 250_000_000_000_000_000n,   // 0.25 EGLD
  Artisan:    500_000_000_000_000_000n,   // 0.50 EGLD
  Master:   1_250_000_000_000_000_000n,   // 1.25 EGLD
  Legend:   2_500_000_000_000_000_000n,   // 2.50 EGLD
};

const ShopCard = ({ tier }) => {
  const { wallet, showToast, refetchCredits } = useApp();
  const [isPurchasing, setIsPurchasing] = useState(false);

  const canAfford = wallet.egld >= tier.cost;
  const isLegend = tier.name === 'Legend';

  const handlePurchase = async () => {
    if (!wallet.isConnected) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    if (!canAfford) {
      showToast(`Insufficient EGLD. Need ${tier.cost}, have ${wallet.egld}`, 'error');
      return;
    }

    if (!CONTRACT_ADDRESS) {
      showToast('Contract address not configured.', 'error');
      return;
    }

    // Always returns a DappProvider (falls back to EmptyProvider if not logged in).
    const dappProvider = getDappProvider();
    if (!dappProvider || dappProvider.getType?.() === 'empty') {
      showToast('Wallet provider not ready. Please reconnect.', 'error');
      return;
    }

    setIsPurchasing(true);

    try {
      // Build the transaction. DappProvider.signTransactions() refreshes the
      // account nonce internally via signTransactionsWithProvider() — we don't
      // need to fetch /accounts/<addr> ourselves. nonce: 0n is a placeholder.
      const tx = new Transaction({
        nonce: 0n,
        value: TIER_VALUES_WEI[tier.name],
        sender: Address.newFromBech32(wallet.address),
        receiver: Address.newFromBech32(CONTRACT_ADDRESS),
        gasLimit: 10_000_000n,
        data: new TextEncoder().encode('buyPixels'),
        chainID: CHAIN_ID,
      });

      // Sign — DappProvider routes correctly per provider type:
      //   Extension  → in-page popup
      //   xPortal    → WalletConnect notification on phone
      //   Web Wallet → redirect to wallet.multiversx.com/sign and back
      //   Ledger     → USB prompt
      const signedTxs = await dappProvider.signTransactions([tx]);

      // Broadcast
      await TransactionManager.getInstance().send(signedTxs);

      showToast(`Transaction sent! Credits will appear in ~15s…`, 'info');

      // Poll aggressively — devnet blocks in ~6s but can be slow under load.
      // Check at 8s, 15s, 25s, 40s, 60s after broadcast.
      [8_000, 15_000, 25_000, 40_000, 60_000].forEach((delay) => {
        setTimeout(refetchCredits, delay);
      });
    } catch (err) {
      console.error('[ShopCard] Purchase error:', err);
      showToast(err?.message ?? 'Transaction failed. Please try again.', 'error');
    } finally {
      setIsPurchasing(false);
    }
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
          {(tier.cost / tier.total).toFixed(6)} EGLD per credit
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
