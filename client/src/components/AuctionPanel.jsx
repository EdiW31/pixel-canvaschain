import { useState, useEffect } from 'react';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useApp } from '../context/AppContext';
import { useWallet, getDappProvider } from '../hooks/useWallet';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';

function shortenAddr(addr) {
  if (!addr || addr.length < 12) return addr || '—';
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function formatEgld(bigIntWei) {
  if (bigIntWei === undefined || bigIntWei === null) return '0';
  const n = Number(bigIntWei) / 1e18;
  return n.toFixed(4);
}

function useCountdown(endTs) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!endTs || endTs === 0) { setRemaining(''); return; }
    const tick = () => {
      const secs = Math.max(0, endTs - Math.floor(Date.now() / 1000));
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setRemaining(secs === 0 ? 'Ended' : `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTs]);

  return remaining;
}

async function sendEgldTx(walletAddress, data, egldValue) {
  const dappProvider = getDappProvider();
  if (!dappProvider || dappProvider.getType?.() === 'empty') {
    throw new Error('Wallet provider not ready. Please reconnect.');
  }
  const tx = new Transaction({
    nonce: 0n,
    value: egldValue,
    sender: Address.newFromBech32(walletAddress),
    receiver: Address.newFromBech32(CONTRACT_ADDRESS),
    gasLimit: 10_000_000n,
    data: new TextEncoder().encode(data),
    chainID: CHAIN_ID,
  });
  const signed = await dappProvider.signTransactions([tx]);
  await TransactionManager.getInstance().send(signed);
}

async function sendTx(walletAddress, data) {
  const dappProvider = getDappProvider();
  if (!dappProvider || dappProvider.getType?.() === 'empty') {
    throw new Error('Wallet provider not ready. Please reconnect.');
  }
  const tx = new Transaction({
    nonce: 0n,
    value: 0n,
    sender: Address.newFromBech32(walletAddress),
    receiver: Address.newFromBech32(CONTRACT_ADDRESS),
    gasLimit: 10_000_000n,
    data: new TextEncoder().encode(data),
    chainID: CHAIN_ID,
  });
  const signed = await dappProvider.signTransactions([tx]);
  await TransactionManager.getInstance().send(signed);
}

const AuctionPanel = () => {
  const { auctionState, refetchAuctionState, wallet, showToast } = useApp();
  const { isConnected } = useWallet();
  const [bidInput, setBidInput] = useState('');
  const [placingBid, setPlacingBid] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const countdown = useCountdown(auctionState?.endTs ?? 0);

  if (!auctionState) return null;

  const { active, sectionX, sectionY, endTs, highestBidder, highestBid, winner, myBid, hasWon } = auctionState;
  const now = Math.floor(Date.now() / 1000);
  const auctionLive = active && now < endTs;
  const auctionEnded = !active && winner;

  if (!auctionLive && !auctionEnded) return null;

  const handlePlaceBid = async () => {
    const amount = parseFloat(bidInput);
    if (!amount || amount <= 0) { showToast('Enter a valid EGLD amount', 'error'); return; }
    if (!isConnected) { showToast('Connect your wallet first', 'error'); return; }
    setPlacingBid(true);
    try {
      const egldWei = BigInt(Math.round(amount * 1e18));
      await sendEgldTx(wallet.address, 'placeBid', egldWei);
      showToast('Bid placed successfully!', 'success');
      setBidInput('');
      setTimeout(refetchAuctionState, 4000);
    } catch (e) {
      showToast(e?.message ?? 'Transaction failed', 'error');
    } finally {
      setPlacingBid(false);
    }
  };

  const handleWithdraw = async () => {
    if (!isConnected) { showToast('Connect your wallet first', 'error'); return; }
    setWithdrawing(true);
    try {
      await sendTx(wallet.address, 'withdrawBid');
      showToast('Bid withdrawn', 'success');
      setTimeout(refetchAuctionState, 4000);
    } catch (e) {
      showToast(e?.message ?? 'Transaction failed', 'error');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="card p-4 w-64 flex flex-col gap-3 text-sm">
      {auctionLive ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-base">🔒</span>
            <div>
              <div className="font-semibold text-textPrimary leading-tight">Day 1 Auction</div>
              <div className="text-xs text-textMuted">Zone ({sectionX}, {sectionY})</div>
            </div>
          </div>

          <div className="space-y-1">
            <Row label="Ends in" value={<span className="font-mono text-xs text-primary">{countdown}</span>} />
            <Row label="Highest bid" value={`${formatEgld(highestBid)} EGLD`} />
            {highestBidder && (
              <Row label="Leader" value={<span className="font-mono text-xs">{shortenAddr(highestBidder)}</span>} />
            )}
            {isConnected && (
              <Row label="Your bid" value={`${formatEgld(myBid)} EGLD`} />
            )}
          </div>

          {isConnected && (
            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={bidInput}
                  onChange={e => setBidInput(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="flex-1 px-2 py-1.5 text-sm rounded-lg bg-backgroundAlt border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <span className="self-center text-xs text-textMuted">EGLD</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePlaceBid}
                  disabled={placingBid || !bidInput}
                  className={`flex-1 btn-primary text-xs py-1.5 ${placingBid || !bidInput ? 'opacity-60 cursor-wait' : ''}`}
                >
                  {placingBid ? (
                    <span className="inline-flex items-center gap-1 justify-center">
                      <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Bidding…
                    </span>
                  ) : 'Place Bid'}
                </button>
                {myBid > BigInt(0) && (
                  <button
                    onClick={handleWithdraw}
                    disabled={withdrawing}
                    className={`btn-ghost text-xs py-1.5 px-2 ${withdrawing ? 'opacity-60 cursor-wait' : ''}`}
                  >
                    {withdrawing ? '…' : 'Withdraw'}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-base">🏆</span>
            <div>
              <div className="font-semibold text-textPrimary leading-tight">Auction Closed</div>
              <div className="text-xs text-textMuted">Zone ({sectionX}, {sectionY})</div>
            </div>
          </div>
          <Row label="Winner" value={<span className="font-mono text-xs break-all">{shortenAddr(winner)}</span>} />
          {hasWon && (
            <div className="rounded-lg px-3 py-2 text-xs font-medium text-center"
              style={{ background: 'rgba(160,80,255,0.12)', color: 'rgb(160,80,255)' }}>
              You have exclusive painting rights this epoch
            </div>
          )}
          {isConnected && myBid > BigInt(0) && (
            <button
              onClick={handleWithdraw}
              disabled={withdrawing}
              className={`btn-ghost text-xs py-1.5 w-full ${withdrawing ? 'opacity-60' : ''}`}
            >
              {withdrawing ? 'Withdrawing…' : `Withdraw your ${formatEgld(myBid)} EGLD bid`}
            </button>
          )}
        </>
      )}
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-textMuted text-xs">{label}</span>
    <span className="text-textPrimary font-medium">{value}</span>
  </div>
);

export default AuctionPanel;
