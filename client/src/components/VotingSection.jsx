import { useState } from 'react';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useApp } from '../context/AppContext';
import { useWallet, getDappProvider } from '../hooks/useWallet';
import { Link } from 'react-router-dom';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';

const ACCENTS  = ['#E53E3E', '#4299E1', '#48BB78', '#ED8936', '#9F7AEA'];
const ICONS    = ['❤', '🌊', '🌿', '☀', '✦'];
// Dummy placeholder images — one per slot, nice editorial photos
const DUMMIES  = [
  'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=400&h=560&fit=crop',
  'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=400&h=560&fit=crop',
  'https://images.unsplash.com/photo-1509099836639-18ba1795216d?w=400&h=560&fit=crop',
  'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=400&h=560&fit=crop',
  'https://images.unsplash.com/photo-1550592704-6c76defa9985?w=400&h=560&fit=crop',
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

function loadMeta(epoch) {
  try {
    return JSON.parse(localStorage.getItem(`charity_meta_epoch_${epoch}`) ?? '[]');
  } catch {
    return [];
  }
}

// ── Single card ───────────────────────────────────────────────────────────────

const CharityCard = ({ charity, index, meta, totalVotes, selected, isMyVote, onSelect, canSelect }) => {
  const accent   = ACCENTS[index % ACCENTS.length];
  const icon     = ICONS[index % ICONS.length];
  const photo    = meta?.photoUrl || DUMMIES[index % DUMMIES.length];
  const link     = meta?.link || null;
  const pct      = totalVotes > 0 ? Math.round((charity.votes / totalVotes) * 100) : 0;
  const isActive = selected === index;

  const card = (
    <div
      onClick={() => canSelect && onSelect(isActive ? null : index)}
      className="relative rounded-3xl overflow-hidden flex flex-col select-none transition-all duration-200"
      style={{
        background: '#fff',
        cursor: canSelect ? 'pointer' : 'default',
        boxShadow: isMyVote
          ? `0 0 0 3px ${accent}, 0 8px 32px rgba(0,0,0,0.14)`
          : isActive
          ? `0 0 0 3px ${accent}, 0 8px 24px rgba(0,0,0,0.12)`
          : '0 4px 20px rgba(0,0,0,0.10)',
        transform: isActive ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* ── Photo area ── */}
      <div className="relative overflow-hidden" style={{ height: 260 }}>
        <img
          src={photo}
          alt={charity.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {/* Soft gradient so text is legible */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.10) 50%, transparent 100%)' }}
        />

        {/* Selection circle — top right */}
        {canSelect && (
          <div
            className="absolute top-3 right-3 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-150"
            style={isActive
              ? { background: accent, borderColor: accent }
              : { background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.6)' }
            }
          >
            {isActive && (
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                <path d="M1 5l3 3L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        )}

        {/* "Your vote" badge */}
        {isMyVote && (
          <div
            className="absolute top-3 left-3 flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: accent, color: '#fff' }}
          >
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Your vote
          </div>
        )}

        {/* Name overlay at bottom of photo */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
          <h3 className="font-heading text-xl font-semibold text-white leading-tight drop-shadow">
            {charity.name}
          </h3>
        </div>
      </div>

      {/* ── Bottom info ── */}
      <div className="px-5 py-4 flex flex-col gap-3" style={{ background: '#fff' }}>
        {/* Vote bar + pct */}
        <div>
          <div className="flex items-center justify-between mb-1.5 text-xs font-medium" style={{ color: '#6b7280' }}>
            <span>{charity.votes} vote{charity.votes !== 1 ? 's' : ''}</span>
            <span style={{ color: accent, fontWeight: 700 }}>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: accent }}
            />
          </div>
        </div>

        {/* Icon badge row */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{ background: accent + '18' }}
          >
            {icon}
          </div>
          <span className="text-xs" style={{ color: '#9ca3af' }}>Charity · Epoch voting</span>
        </div>
      </div>
    </div>
  );

  // Wrap in <a> if link is set (but clicking the card for voting is separate)
  // We add a small external link icon instead so clicking card = vote, icon = website
  return (
    <div className="flex flex-col gap-2">
      {card}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-xs font-medium transition-opacity hover:opacity-70 flex items-center justify-center gap-1"
          style={{ color: accent }}
          onClick={e => e.stopPropagation()}
        >
          Visit website ↗
        </a>
      )}
    </div>
  );
};

// ── Section ───────────────────────────────────────────────────────────────────

const VotingSection = ({ compact = false, onYellow = false }) => {
  const { epochInfo, votingState, refetchVotingState, wallet, showToast } = useApp();
  const { isConnected } = useWallet();
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { charities, hasVoted, userVoteIndex, loading } = votingState;
  const totalVotes = charities.reduce((s, c) => s + c.votes, 0);
  const canVote = isConnected && epochInfo.epoch > 0 && !hasVoted && charities.length > 0;
  const meta = loadMeta(epochInfo.epoch);

  const handleCastVote = async () => {
    if (selected === null || !canVote || submitting) return;
    setSubmitting(true);
    try {
      await sendVoteTx(wallet.address, selected);
      showToast(`Voted for ${charities[selected]?.name}!`, 'success');
      setSelected(null);
      setTimeout(refetchVotingState, 4000);
    } catch (e) {
      showToast(e?.message ?? 'Vote transaction failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!epochInfo.epoch) return null;

  const textClr  = onYellow ? '#1B1A17'             : 'rgb(var(--text))';
  const mutedClr = onYellow ? 'rgba(27,26,23,0.55)' : 'rgb(var(--text-muted))';

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span
          className="inline-block w-8 h-8 border-2 rounded-full animate-spin"
          style={onYellow
            ? { borderColor: 'rgba(27,26,23,0.15)', borderTopColor: '#1B1A17' }
            : { borderColor: 'rgba(229,181,71,0.3)', borderTopColor: 'rgb(var(--primary))' }
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

  const selectedAccent = selected !== null ? ACCENTS[selected % ACCENTS.length] : null;

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

      {/* Cards grid */}
      <div className={`grid gap-5 ${
        charities.length === 1 ? 'max-w-xs'            :
        charities.length === 2 ? 'sm:grid-cols-2 max-w-2xl' :
                                  'sm:grid-cols-2 lg:grid-cols-3'
      }`}>
        {charities.map((charity, i) => (
          <CharityCard
            key={i}
            charity={charity}
            index={i}
            meta={meta[i] ?? null}
            totalVotes={totalVotes}
            selected={selected}
            isMyVote={hasVoted && userVoteIndex === i}
            onSelect={setSelected}
            canSelect={canVote && !submitting}
          />
        ))}
      </div>

      {/* Bottom action */}
      <div className="mt-8">
        {canVote ? (
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleCastVote}
              disabled={selected === null || submitting}
              className="px-8 py-3 rounded-2xl text-sm font-bold transition-all duration-150"
              style={selected === null
                ? { background: 'rgba(255,255,255,0.25)', color: 'rgba(27,26,23,0.40)', cursor: 'not-allowed' }
                : submitting
                ? { background: selectedAccent, color: '#fff', opacity: 0.7, cursor: 'wait' }
                : { background: selectedAccent, color: '#fff', boxShadow: `0 4px 20px ${selectedAccent}66` }
              }
            >
              {submitting
                ? 'Signing transaction…'
                : selected !== null
                ? `Cast vote for ${charities[selected]?.name} →`
                : 'Select a charity above'
              }
            </button>
            {selected !== null && !submitting && (
              <button
                onClick={() => setSelected(null)}
                className="text-sm font-medium transition-opacity hover:opacity-60"
                style={{ color: mutedClr }}
              >
                Clear
              </button>
            )}
          </div>
        ) : !isConnected ? (
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-8 py-3 rounded-2xl text-sm font-bold transition-opacity hover:opacity-85"
              style={onYellow
                ? { background: '#1B1A17', color: '#fff' }
                : { background: 'rgb(var(--primary))', color: '#1B1A17' }
              }
            >
              Connect wallet to vote
            </Link>
            <span className="text-xs" style={{ color: mutedClr }}>One vote per wallet · on-chain</span>
          </div>
        ) : hasVoted ? (
          <p className="text-sm" style={{ color: mutedClr }}>
            You already cast your vote this epoch. Results update every 30 seconds.
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default VotingSection;
