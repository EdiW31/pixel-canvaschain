import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useApp } from '../context/AppContext';
import { useWallet, getDappProvider } from '../hooks/useWallet';
import MarketingNav from '../components/MarketingNav';
import { Dot, Stroke } from '../components/PaintDecorations';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';
const DEVNET_EXPLORER = 'https://devnet-explorer.multiversx.com/accounts';

// Helpers

function shortenAddr(addr) {
  if (!addr || addr.length < 12) return addr || '—';
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

function formatEgld(bigIntWei) {
  if (bigIntWei === undefined || bigIntWei === null) return '0.0000';
  const n = Number(bigIntWei) / 1e18;
  return n.toFixed(4);
}

function useCountdown(endTs) {
  const [remaining, setRemaining] = useState('');
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!endTs || endTs === 0) { setRemaining(''); setSecs(0); return; }
    const tick = () => {
      const s = Math.max(0, endTs - Math.floor(Date.now() / 1000));
      setSecs(s);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      setRemaining(s === 0 ? 'Ended' : `${h}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTs]);

  return { label: remaining, secs };
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

// Zone diagram (mini canvas preview)

const ZoneDiagram = ({ sectionX, sectionY, accent = '#E5B547' }) => {
  const CELLS = 10; // render 10×10 grid of dots
  const ZONE_CELLS = 2; // 20px = 2 cells in 10-cell grid (scale: 10px/cell)
  const zoneColStart = Math.floor(sectionX / 10);
  const zoneRowStart = Math.floor(sectionY / 10);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="grid border border-border rounded-lg overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${CELLS}, 1fr)`, width: 140, height: 140 }}
      >
        {Array.from({ length: CELLS * CELLS }, (_, i) => {
          const col = i % CELLS;
          const row = Math.floor(i / CELLS);
          const inZone =
            col >= zoneColStart && col < zoneColStart + ZONE_CELLS &&
            row >= zoneRowStart && row < zoneRowStart + ZONE_CELLS;
          return (
            <div
              key={i}
              style={{
                background: inZone ? accent : 'transparent',
                border: `0.5px solid rgba(128,128,128,0.1)`,
                transition: 'background 0.3s',
              }}
            />
          );
        })}
      </div>
      <p className="text-xs text-textMuted text-center">
        20×20 zone at ({sectionX}, {sectionY})
      </p>
    </div>
  );
};

// Info card (reused from ShopPage pattern)

const InfoCard = ({ accent, tag, title, body }) => (
  <div className="card p-6 overflow-hidden relative">
    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: accent }} />
    <div className="pill mb-3 mt-2">{tag}</div>
    <h3 className="font-heading text-lg font-semibold mb-2">{title}</h3>
    <p className="text-sm text-textSecondary leading-relaxed">{body}</p>
  </div>
);

// Stat row item

const StatItem = ({ label, value, accent }) => (
  <div>
    <div className="text-xs text-textMuted mb-1 uppercase tracking-wider font-medium">{label}</div>
    <div className="text-2xl font-semibold" style={accent ? { color: accent } : {}}>{value}</div>
  </div>
);

const VDivider = () => <div className="hidden sm:block w-px h-10 bg-border" />;

// Main page

const AuctionPage = () => {
  const { auctionState, refetchAuctionState, wallet, showToast } = useApp();
  const { isConnected } = useWallet();
  const navigate = useNavigate();
  const [bidInput, setBidInput] = useState('');
  const [placingBid, setPlacingBid] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const { label: countdown, secs: remainingSecs } = useCountdown(auctionState?.endTs ?? 0);

  const now = Math.floor(Date.now() / 1000);
  const auctionLive = auctionState?.active && now < (auctionState?.endTs ?? 0);
  const auctionClosed = auctionState && !auctionState.active && auctionState.winner;
  const noAuction = !auctionState || (!auctionLive && !auctionClosed);

  const { sectionX = 0, sectionY = 0, endTs = 0, highestBidder, highestBid, winner, myBid, hasWon } = auctionState ?? {};

  const handlePlaceBid = async () => {
    const amount = parseFloat(bidInput);
    if (!amount || amount <= 0) { showToast('Enter a valid EGLD amount', 'error'); return; }
    if (!isConnected) { showToast('Connect your wallet first', 'error'); return; }
    setPlacingBid(true);
    try {
      const egldWei = BigInt(Math.round(amount * 1e18));
      await sendEgldTx(wallet.address, 'placeBid', egldWei);
      showToast('Bid placed!', 'success');
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
      showToast('Bid withdrawn!', 'success');
      setTimeout(refetchAuctionState, 4000);
    } catch (e) {
      showToast(e?.message ?? 'Transaction failed', 'error');
    } finally {
      setWithdrawing(false);
    }
  };

  const isHighestBidder = highestBidder && wallet.address && highestBidder === wallet.address;
  const canWithdraw = isConnected && myBid && myBid > BigInt(0) && !isHighestBidder;

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />

      <main className="max-w-4xl mx-auto px-6 py-12 pt-16">

        <div className="relative overflow-hidden rounded-2xl bg-backgroundAlt border border-border px-8 pt-10 pb-8 mb-8 animate-fade-in">
          <Dot color="#E5B547" style={{ top: 18,  left: '4%'  }} />
          <Dot color="#ED8936" style={{ top: 40,  right: '6%' }} />
          <Dot color="#9F7AEA" style={{ bottom: 22, left: '55%' }} />
          <Dot color="#E53E3E" style={{ top: 60,  right: '20%' }} />
          <Dot color="#4299E1" style={{ bottom: 32, left: '28%' }} />

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              {auctionLive && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3"
                  style={{ background: 'rgba(229,181,71,0.15)', color: '#B8860B', border: '1.5px solid rgba(229,181,71,0.5)' }}>
                  <span className="w-2 h-2 rounded-full bg-yellow-500 animate-subtle-pulse" />
                  Live Auction · Zone ({sectionX}, {sectionY})
                </div>
              )}
              {auctionClosed && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3"
                  style={{ background: 'rgba(160,80,255,0.12)', color: 'rgb(130,60,210)', border: '1.5px solid rgba(160,80,255,0.35)' }}>
                  🏆 Auction Closed · Zone ({sectionX}, {sectionY})
                </div>
              )}
              {noAuction && (
                <div className="pill mb-3">No Active Auction</div>
              )}

              <h1 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight mb-2">
                Epoch Auction
              </h1>
              <Stroke color="#E5B547" />
              <p className="text-textSecondary max-w-xl mt-1">
                Each epoch, a 20×20 pixel zone is auctioned to the highest bidder. The winner
                gets exclusive painting rights to that zone for the rest of the epoch.
              </p>
            </div>

            {(auctionLive || auctionClosed) && (
              <button
                onClick={() => navigate('/canvas')}
                className="btn-primary-lg whitespace-nowrap flex-shrink-0"
              >
                Open Canvas →
              </button>
            )}
          </div>
        </div>

        {auctionLive && (
          <div className="card p-6 mb-8 animate-fade-in">
            <div className="flex flex-col lg:flex-row gap-8">

              {/* Left: stats + bid form */}
              <div className="flex-1 flex flex-col gap-6">

                <div>
                  <div className="text-xs text-textMuted uppercase tracking-wider font-medium mb-2">Auction ends in</div>
                  <div className="font-mono text-5xl font-bold tracking-tight" style={{ color: '#B8860B' }}>
                    {countdown || '—'}
                  </div>
                  {remainingSecs < 3600 && remainingSecs > 0 && (
                    <p className="text-xs text-error mt-1">Less than 1 hour remaining!</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-8 gap-y-4 py-4 border-t border-b border-border">
                  <StatItem
                    label="Highest bid"
                    value={`${formatEgld(highestBid)} EGLD`}
                    accent="#E5B547"
                  />
                  <VDivider />
                  {highestBidder ? (
                    <div>
                      <div className="text-xs text-textMuted mb-1 uppercase tracking-wider font-medium">Leader</div>
                      <a
                        href={`${DEVNET_EXPLORER}/${highestBidder}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm hover:underline text-textPrimary"
                      >
                        {shortenAddr(highestBidder)}
                      </a>
                    </div>
                  ) : (
                    <StatItem label="Leader" value="No bids yet" />
                  )}
                  {isConnected && (
                    <>
                      <VDivider />
                      <StatItem
                        label="Your bid"
                        value={`${formatEgld(myBid)} EGLD`}
                        accent={myBid && myBid > BigInt(0) ? '#48BB78' : undefined}
                      />
                    </>
                  )}
                </div>

                {isConnected ? (
                  <div className="flex flex-col gap-3">
                    <label className="text-sm font-medium text-textSecondary">Add to your bid</label>
                    <div className="flex gap-3 items-center">
                      <div className="relative flex-1 max-w-xs">
                        <input
                          type="number"
                          value={bidInput}
                          onChange={e => setBidInput(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          className="w-full px-4 py-3 text-lg rounded-xl bg-backgroundAlt border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 pr-16"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-textMuted font-medium">EGLD</span>
                      </div>
                      <button
                        onClick={handlePlaceBid}
                        disabled={placingBid || !bidInput || parseFloat(bidInput) <= 0}
                        className="btn-primary-lg"
                        style={placingBid || !bidInput ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                      >
                        {placingBid ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Bidding…
                          </span>
                        ) : 'Place Bid'}
                      </button>
                    </div>

                    {isHighestBidder && (
                      <p className="text-sm font-semibold" style={{ color: '#48BB78' }}>
                        You are currently the highest bidder!
                      </p>
                    )}

                    {canWithdraw && (
                      <button
                        onClick={handleWithdraw}
                        disabled={withdrawing}
                        className="text-sm text-textMuted hover:text-textSecondary transition-colors self-start underline underline-offset-2"
                      >
                        {withdrawing ? 'Withdrawing…' : `Withdraw my ${formatEgld(myBid)} EGLD bid`}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => navigate('/login')}
                      className="btn-primary-lg"
                    >
                      Connect wallet to bid
                    </button>
                    <span className="text-xs text-textMuted">One wallet · on-chain</span>
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 flex flex-col items-center justify-start gap-4 pt-2">
                <ZoneDiagram sectionX={sectionX} sectionY={sectionY} accent="#E5B547" />
                <div className="text-xs text-textMuted text-center max-w-[160px]">
                  Highlighted area is the exclusive painting zone
                </div>
              </div>
            </div>
          </div>
        )}

        {auctionClosed && (
          <div className="card p-6 mb-8 animate-fade-in">
            <div className="flex flex-col lg:flex-row gap-8">

              <div className="flex-1 flex flex-col gap-5">
                <div>
                  <div className="text-xs text-textMuted uppercase tracking-wider font-medium mb-1">Auction result</div>
                  <h2 className="font-heading text-2xl font-semibold">Zone won!</h2>
                </div>

                <div className="flex flex-wrap items-center gap-x-8 gap-y-4 py-4 border-t border-b border-border">
                  <div>
                    <div className="text-xs text-textMuted mb-1 uppercase tracking-wider font-medium">Winner</div>
                    <a
                      href={`${DEVNET_EXPLORER}/${winner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm hover:underline text-textPrimary"
                    >
                      {shortenAddr(winner)}
                    </a>
                  </div>
                  <VDivider />
                  <StatItem
                    label="Winning bid"
                    value={`${formatEgld(highestBid)} EGLD`}
                    accent="#9F7AEA"
                  />
                </div>

                {hasWon ? (
                  <div className="rounded-xl px-5 py-4 flex items-start gap-4"
                    style={{ background: 'rgba(160,80,255,0.08)', border: '2px solid rgba(160,80,255,0.3)' }}>
                    <div className="text-2xl flex-shrink-0">🏆</div>
                    <div>
                      <p className="font-heading font-bold text-base mb-1">
                        You won this zone!
                      </p>
                      <p className="text-sm text-textSecondary">
                        You have exclusive painting rights to zone ({sectionX}, {sectionY}) for this epoch.
                        Head to the canvas and paint away!
                      </p>
                      <button
                        onClick={() => navigate('/canvas')}
                        className="btn-primary mt-3"
                      >
                        Go paint your zone →
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-textSecondary">
                    The winner has exclusive painting rights to zone ({sectionX}, {sectionY}) for this epoch.
                  </p>
                )}

                {canWithdraw && (
                  <button
                    onClick={handleWithdraw}
                    disabled={withdrawing}
                    className="text-sm text-textMuted hover:text-textSecondary transition-colors self-start underline underline-offset-2"
                  >
                    {withdrawing ? 'Withdrawing…' : `Withdraw your ${formatEgld(myBid)} EGLD bid`}
                  </button>
                )}
              </div>

              <div className="flex-shrink-0 flex flex-col items-center justify-start gap-4 pt-2">
                <ZoneDiagram sectionX={sectionX} sectionY={sectionY} accent="#9F7AEA" />
              </div>
            </div>
          </div>
        )}

        {noAuction && (
          <div className="card p-10 mb-8 text-center animate-fade-in">
            <div className="text-5xl mb-4">🔨</div>
            <h2 className="font-heading text-2xl font-semibold mb-2">No auction yet this epoch</h2>
            <p className="text-textSecondary max-w-md mx-auto text-sm">
              The admin starts a new auction at the beginning of each epoch. Check back soon —
              when one goes live you'll be able to bid for exclusive painting rights on a 20×20 zone.
            </p>
          </div>
        )}

        <div className="mt-4 grid md:grid-cols-3 gap-5">
          <InfoCard
            accent="#E5B547"
            tag="Day 1 only"
            title="24-hour bidding window"
            body="Each epoch's auction runs for the first 24 hours. Miss it and you'll wait until the next epoch."
          />
          <InfoCard
            accent="#9F7AEA"
            tag="Exclusive zone"
            title="Winner paints freely"
            body="Once the auction closes, only the winner can paint in that 20×20 zone. Other wallets are locked out."
          />
          <InfoCard
            accent="#48BB78"
            tag="Fair & on-chain"
            title="Outbid? Get refunded"
            body="If you're outbid, you can withdraw your EGLD any time. The winning bid routes to the epoch charity pot."
          />
        </div>

      </main>
    </div>
  );
};

export default AuctionPage;
