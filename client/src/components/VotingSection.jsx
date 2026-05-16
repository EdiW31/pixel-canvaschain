import { useState } from 'react';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useApp } from '../context/AppContext';
import { useWallet, getDappProvider } from '../hooks/useWallet';
import { Link } from 'react-router-dom';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';

const PALETTE = [
  { accent: '#E53E3E', bg: 'rgba(229,62,62,0.08)',   symbol: '❤' },
  { accent: '#4299E1', bg: 'rgba(66,153,225,0.08)',  symbol: '🌊' },
  { accent: '#48BB78', bg: 'rgba(72,187,120,0.08)',  symbol: '🌿' },
  { accent: '#ED8936', bg: 'rgba(237,137,54,0.08)',  symbol: '☀' },
  { accent: '#9F7AEA', bg: 'rgba(159,122,234,0.08)', symbol: '✦' },
];

async function sendVoteTx(walletAddress, charityIndex) {
  const dappProvider = getDappProvider();
  if (!dappProvider || dappProvider.getType?.() === 'empty') {
    throw new Error('Wallet provider not ready. Please reconnect.');
  }
  const indexHex = charityIndex.toString(16).padStart(8, '0');
  const tx = new Transaction({
    nonce: 0n,
    value: 0n,
    sender: Address.newFromBech32(walletAddress),
    receiver: Address.newFromBech32(CONTRACT_ADDRESS),
    gasLimit: 5_000_000n,
    data: new TextEncoder().encode(`vote@${indexHex}`),
    chainID: CHAIN_ID,
  });
  const signed = await dappProvider.signTransactions([tx]);
  await TransactionManager.getInstance().send(signed);
}

// ── Charity card ─────────────────────────────────────────────────────────────

const CharityCard = ({ charity, index, totalVotes, onVote, canVote, isMyVote, submitting, onYellow }) => {
  const { accent, bg, symbol } = PALETTE[index % PALETTE.length];
  const pct = totalVotes > 0 ? Math.round((charity.votes / totalVotes) * 100) : 0;

  // Surface colors depend on context
  const cardBg    = onYellow ? '#FFFFFF' : 'rgb(var(--surface))';
  const borderClr = isMyVote
    ? accent
    : onYellow ? 'rgba(27,26,23,0.12)' : 'rgb(var(--border))';
  const nameclr   = onYellow ? '#1B1A17' : 'rgb(var(--text))';
  const mutedClr  = onYellow ? 'rgba(27,26,23,0.50)' : 'rgb(var(--text-muted))';
  const trackClr  = onYellow ? 'rgba(27,26,23,0.10)' : 'rgb(var(--border))';

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col transition-all duration-200"
      style={{
        background: cardBg,
        border: `1.5px solid ${borderClr}`,
        boxShadow: isMyVote
          ? `0 0 0 3px ${accent}33, 0 4px 20px rgba(0,0,0,0.08)`
          : '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      {/* Photo / avatar area */}
      <div
        className="relative flex items-center justify-center"
        style={{ background: bg, height: 110 }}
      >
        {/* Accent top stripe */}
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accent }} />

        {/* Big symbol placeholder */}
        <span
          className="select-none"
          style={{ fontSize: 48, lineHeight: 1, color: accent, opacity: 0.75 }}
        >
          {symbol}
        </span>

        {/* "Your vote" badge */}
        {isMyVote && (
          <div
            className="absolute top-4 right-4 text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: accent, color: '#fff' }}
          >
            ✓ Your vote
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-5 gap-4">
        {/* Name + vote count */}
        <div>
          <h3
            className="font-heading text-lg font-semibold leading-tight mb-1"
            style={{ color: nameclr }}
          >
            {charity.name}
          </h3>
          <p className="text-xs font-medium" style={{ color: mutedClr }}>
            {charity.votes} vote{charity.votes !== 1 ? 's' : ''} · {pct}%
          </p>
        </div>

        {/* Vote bar */}
        <div className="h-2 rounded-full overflow-hidden" style={{ background: trackClr }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: accent }}
          />
        </div>

        {/* Vote button — pinned to bottom */}
        <div className="mt-auto">
          {canVote ? (
            <button
              onClick={() => onVote(index)}
              disabled={submitting}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-all duration-150"
              style={submitting
                ? { opacity: 0.5, cursor: 'wait', background: trackClr, color: mutedClr }
                : { background: accent + '18', color: accent, border: `1.5px solid ${accent}` }
              }
              onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = accent + '30'; }}
              onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = accent + '18'; }}
            >
              {submitting ? 'Signing…' : `Vote for ${charity.name.split(' ')[0]}`}
            </button>
          ) : isMyVote ? (
            <div
              className="w-full py-2.5 rounded-xl text-sm font-bold text-center"
              style={{ background: accent + '18', color: accent }}
            >
              ✓ Voted
            </div>
          ) : (
            <Link
              to="/login"
              className="block w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-opacity hover:opacity-75"
              style={{ background: trackClr, color: mutedClr }}
            >
              Connect to vote
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Section ───────────────────────────────────────────────────────────────────

const VotingSection = ({ compact = false, onYellow = false }) => {
  const { epochInfo, votingState, refetchVotingState, wallet, showToast } = useApp();
  const { isConnected } = useWallet();
  const [submitting, setSubmitting] = useState(false);

  const { charities, hasVoted, userVoteIndex, loading } = votingState;
  const totalVotes = charities.reduce((s, c) => s + c.votes, 0);
  const canVote = isConnected && epochInfo.epoch > 0 && !hasVoted && charities.length > 0;

  const handleVote = async (index) => {
    if (!canVote || submitting) return;
    setSubmitting(true);
    try {
      await sendVoteTx(wallet.address, index);
      showToast(`Voted for ${charities[index]?.name}!`, 'success');
      setTimeout(refetchVotingState, 4000);
    } catch (e) {
      showToast(e?.message ?? 'Vote transaction failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!epochInfo.epoch) return null;

  const textClr   = onYellow ? '#1B1A17'              : 'rgb(var(--text))';
  const mutedClr  = onYellow ? 'rgba(27,26,23,0.55)'  : 'rgb(var(--text-muted))';

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span
          className="inline-block w-8 h-8 border-2 rounded-full animate-spin"
          style={onYellow
            ? { borderColor: 'rgba(27,26,23,0.15)', borderTopColor: '#1B1A17' }
            : { borderColor: 'rgb(var(--primary)/30)', borderTopColor: 'rgb(var(--primary))' }
          }
        />
      </div>
    );
  }

  if (charities.length === 0) {
    return (
      <div className="text-center py-16" style={{ color: mutedClr }}>
        <div className="text-4xl mb-3">🗳</div>
        <p className="text-sm">No charities set for epoch {epochInfo.epoch} yet.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mb-8">
        <div>
          <div className="text-xs uppercase tracking-wider font-medium mb-0.5" style={{ color: mutedClr }}>
            Total votes
          </div>
          <div className="text-2xl font-bold" style={{ color: textClr }}>{totalVotes}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider font-medium mb-0.5" style={{ color: mutedClr }}>
            Charities
          </div>
          <div className="text-2xl font-bold" style={{ color: textClr }}>{charities.length}</div>
        </div>
        {hasVoted && (
          <div
            className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold"
            style={onYellow
              ? { background: 'rgba(27,26,23,0.12)', color: '#1B1A17' }
              : { background: 'rgb(var(--primary-light))', color: 'rgb(var(--primary-dark))' }
            }
          >
            ✓ You voted this epoch
          </div>
        )}
      </div>

      {/* Cards grid — 1 col on mobile, up to 3 on large */}
      <div className={`grid gap-5 ${
        charities.length === 1 ? 'max-w-sm' :
        charities.length === 2 ? 'sm:grid-cols-2 max-w-2xl' :
        'sm:grid-cols-2 lg:grid-cols-3'
      }`}>
        {charities.map((charity, i) => (
          <CharityCard
            key={i}
            charity={charity}
            index={i}
            totalVotes={totalVotes}
            onVote={handleVote}
            canVote={canVote}
            isMyVote={hasVoted && userVoteIndex === i}
            submitting={submitting}
            onYellow={onYellow}
          />
        ))}
      </div>

      {!isConnected && (
        <p className="text-xs text-center mt-6" style={{ color: mutedClr }}>
          Connect your MultiversX wallet to cast your vote on-chain.
        </p>
      )}
    </div>
  );
};

export default VotingSection;
