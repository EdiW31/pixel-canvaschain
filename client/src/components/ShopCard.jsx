import { useState, useEffect, useRef } from 'react';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useApp } from '../context/AppContext';
import { getDappProvider } from '../hooks/useWallet';

// ShopCard — single tier card. On purchase: build a buyPixels Transaction, sign
// via the DappProvider, broadcast, then run a 15s countdown polling the balance.
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';

// Devnet tier values in smallest EGLD units (1 EGLD = 10^18)
const TIER_VALUES_WEI = {
  Novice:      50_000_000_000_000_000n,
  Apprentice: 250_000_000_000_000_000n,
  Artisan:    500_000_000_000_000_000n,
  Master:   1_250_000_000_000_000_000n,
  Legend:   2_500_000_000_000_000_000n,
};

const WAIT_SECONDS = 15;

const ShopCard = ({ tier }) => {
  const { wallet, showToast, refetchPixelBalance } = useApp();
  const [isPurchasing, setIsPurchasing] = useState(false);
  // 'idle' | 'waiting' | 'hint'
  const [confirmState, setConfirmState] = useState('idle');
  const [countdown, setCountdown] = useState(WAIT_SECONDS);
  const timerRef = useRef(null);

  // Countdown tick
  useEffect(() => {
    if (confirmState !== 'waiting') return;
    setCountdown(WAIT_SECONDS);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setConfirmState('hint');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [confirmState]);

  const canAfford = wallet.egld >= tier.cost;
  const isFeatured = !!tier.badge;
  const charityShare = (tier.cost * 0.5).toFixed(4); // 50% to charity

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
    const dappProvider = getDappProvider();
    if (!dappProvider || dappProvider.getType?.() === 'empty') {
      showToast('Wallet provider not ready. Please reconnect.', 'error');
      return;
    }

    setIsPurchasing(true);
    try {
      const tx = new Transaction({
        nonce: 0n,
        value: TIER_VALUES_WEI[tier.name],
        sender: Address.newFromBech32(wallet.address),
        receiver: Address.newFromBech32(CONTRACT_ADDRESS),
        gasLimit: 10_000_000n,
        data: new TextEncoder().encode('buyPixels'),
        chainID: CHAIN_ID,
      });

      const signedTxs = await dappProvider.signTransactions([tx]);
      await TransactionManager.getInstance().send(signedTxs);

      setConfirmState('waiting');

      // Poll PIXEL balance after broadcast (devnet block ~6s)
      [8_000, 15_000, 25_000, 40_000, 60_000].forEach((delay) => {
        setTimeout(refetchPixelBalance, delay);
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
      className={`relative card p-6 flex flex-col transition-all duration-200
        ${isFeatured ? 'ring-2 ring-primary shadow-card' : 'hover:shadow-card'}
      `}
    >
      {isFeatured && (
        <div className="absolute -top-3 left-6 pill">
          {tier.badge}
        </div>
      )}

      <div className="mb-5">
        <h3 className="font-heading text-2xl font-semibold mb-3">{tier.name}</h3>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold text-primaryDark tracking-tight">{tier.cost}</span>
          <span className="text-sm text-textMuted">EGLD</span>
        </div>
      </div>

      <div className="space-y-2 mb-5 pb-5 border-b border-border">
        <Row label="Base pixels" value={tier.basePixels.toLocaleString()} />
        {tier.bonusPixels > 0 && (
          <Row
            label={`Bonus (+${tier.bonusPercent}%)`}
            value={`+${tier.bonusPixels.toLocaleString()}`}
            highlight
          />
        )}
        <Row label="Total" value={tier.total.toLocaleString()} bold />
      </div>

      <div className="flex items-center gap-2 text-xs text-charityDark bg-charityLight rounded-md px-3 py-2 mb-5">
        <span>♥</span>
        <span><strong>{charityShare}</strong> EGLD will go to charity.</span>
      </div>

      <button
        onClick={handlePurchase}
        disabled={!canAfford || isPurchasing}
        className={`mt-auto w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200
          ${
            isPurchasing
              ? 'bg-primaryLight text-primaryDark cursor-wait'
              : !canAfford
                ? 'bg-backgroundAlt text-textMuted cursor-not-allowed'
                : isFeatured
                  ? 'bg-primary hover:bg-primaryDark text-textPrimary shadow-soft hover:shadow-card border border-primaryDark/40'
                  : 'bg-surface text-textPrimary border border-borderStrong hover:bg-backgroundAlt'
          }`}
      >
        {isPurchasing ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-primaryDark/40 border-t-primaryDark rounded-full animate-spin" />
            Processing…
          </span>
        ) : !canAfford ? 'Insufficient EGLD' : 'Buy PIXEL tokens'}
      </button>

      {confirmState !== 'idle' && (
        <div className="absolute inset-0 rounded-xl bg-surface/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10 animate-fade-in">
          {confirmState === 'waiting' ? (
            <>
              <div className="w-12 h-12 border-[3px] border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
              <p className="font-heading text-lg font-semibold mb-1">
                Confirming on chain…
              </p>
              <p className="text-sm text-textSecondary mb-5">
                Your credits will appear shortly.
              </p>
              <div className="w-full bg-backgroundAlt rounded-full h-1.5 mb-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-1000"
                  style={{ width: `${(countdown / WAIT_SECONDS) * 100}%` }}
                />
              </div>
              <p className="text-xs text-textMuted">{countdown}s remaining</p>
            </>
          ) : (
            <>
              <div className="text-4xl mb-3">✓</div>
              <p className="font-heading text-lg font-semibold text-charityDark mb-1">
                Transaction sent
              </p>
              <p className="text-sm text-textSecondary mb-5">
                PIXEL tokens not showing? Refresh from the chain.
              </p>
              <button
                onClick={() => { refetchPixelBalance(); setConfirmState('idle'); }}
                className="btn-primary mb-1"
              >
                ↻ Refresh balance
              </button>
              <button
                onClick={() => setConfirmState('idle')}
                className="text-xs text-textMuted hover:text-textPrimary transition-colors mt-2"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value, highlight, bold }) => (
  <div className="flex justify-between text-sm">
    <span className={highlight ? 'text-charityDark' : 'text-textSecondary'}>{label}</span>
    <span
      className={`${highlight ? 'text-charityDark' : 'text-textPrimary'} ${bold ? 'font-semibold text-base' : 'font-medium'}`}
    >
      {value}
    </span>
  </div>
);

export default ShopCard;
