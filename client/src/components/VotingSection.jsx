import { useState } from 'react';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useApp } from '../context/AppContext';
import { useWallet, getDappProvider } from '../hooks/useWallet';
import { Link } from 'react-router-dom';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';

const ACCENTS = ['#E53E3E', '#4299E1', '#48BB78', '#ED8936', '#9F7AEA'];
const ICONS   = ['❤', '🌊', '🌿', '☀', '✦'];

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

// ── Single charity card ───────────────────────────────────────────────────────

const CharityCard = ({ charity, index, totalVotes, selected, voted, isMyVote, onSelect, canSelect, onYellow }) => {
  const accent  = ACCENTS[index % ACCENTS.length];
  const icon    = ICONS[index % ICONS.length];
  const pct     = totalVotes > 0 ? Math.round((charity.votes / totalVotes) * 100) : 0;

  const isActive = selected === index;

  // Colour tokens
  const cardBg   = onYellow ? '#FFFFFF' : 'rgb(var(--surface))';
  const nameClr  = onYellow ? '#1B1A17' : 'rgb(var(--text))';
  const mutedClr = onYellow ? 'rgba(27,26,23,0.50)' : 'rgb(var(--text-muted))';
  const trackClr = onYellow ? 'rgba(27,26,23,0.10)' : 'rgb(var(--border))';

  let borderStyle, shadowStyle;
  if (isMyVote) {
    borderStyle = `2px solid ${accent}`;
    shadowStyle = `0 0 0 4px ${accent}22, 0 4px 20px rgba(0,0,0,0.08)`;
  } else if (isActive) {
    borderStyle = `2px solid ${accent}`;
    shadowStyle = `0 0 0 4px ${accent}18, 0 4px 16px rgba(0,0,0,0.06)`;
  } else {
    borderStyle = onYellow ? '1.5px solid rgba(27,26,23,0.12)' : '1.5px solid rgb(var(--border))';
    shadowStyle = '0 2px 8px rgba(0,0,0,0.05)';
  }

  return (
    <button
      onClick={() => canSelect && onSelect(index)}
      disabled={!canSelect}
      className="text-left rounded-2xl overflow-hidden flex flex-col transition-all duration-200 w-full"
      style={{
        background: isActive ? `${accent}0d` : cardBg,
        border: borderStyle,
        boxShadow: shadowStyle,
        cursor: canSelect ? 'pointer' : 'default',
        outline: 'none',
      }}
    >
      {/* Top accent bar */}
      <div className="h-1 w-full flex-shrink-0" style={{ background: accent }} />

      {/* Icon area */}
      <div
        className="flex items-center justify-center flex-shrink-0 relative"
        style={{ height: 90, background: `${accent}12` }}
      >
        <span style={{ fontSize: 40, lineHeight: 1 }}>{icon}</span>

        {/* Selection indicator */}
        {canSelect && (
          <div
            className="absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150"
            style={isActive
              ? { borderColor: accent, background: accent }
              : { borderColor: onYellow ? 'rgba(27,26,23,0.25)' : 'rgb(var(--border-strong))', background: 'transparent' }
            }
          >
            {isActive && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        )}

        {/* "Your vote" badge when voted */}
        {isMyVote && (
          <div
            className="absolute top-3 right-3 flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: accent, color: '#fff' }}
          >
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Your vote
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        <div>
          <h3 className="font-heading text-base font-semibold leading-snug mb-0.5" style={{ color: nameClr }}>
            {charity.name}
          </h3>
          <p className="text-xs" style={{ color: mutedClr }}>
            {charity.votes} vote{charity.votes !== 1 ? 's' : ''} · {pct}%
          </p>
        </div>

        {/* Vote bar */}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: trackClr }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: accent }}
          />
        </div>
      </div>
    </button>
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
      <div className={`grid gap-4 ${
        charities.length === 1 ? 'max-w-xs' :
        charities.length === 2 ? 'sm:grid-cols-2 max-w-xl' :
        'sm:grid-cols-2 lg:grid-cols-3'
      }`}>
        {charities.map((charity, i) => (
          <CharityCard
            key={i}
            charity={charity}
            index={i}
            totalVotes={totalVotes}
            selected={selected}
            voted={hasVoted}
            isMyVote={hasVoted && userVoteIndex === i}
            onSelect={setSelected}
            canSelect={canVote && !submitting}
            onYellow={onYellow}
          />
        ))}
      </div>

      {/* Bottom action area */}
      <div className="mt-6">
        {canVote ? (
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleCastVote}
              disabled={selected === null || submitting}
              className="px-8 py-3 rounded-xl text-sm font-bold transition-all duration-150"
              style={selected === null
                ? {
                    background: onYellow ? 'rgba(27,26,23,0.10)' : 'rgb(var(--border))',
                    color: mutedClr,
                    cursor: 'not-allowed',
                  }
                : submitting
                ? { background: selectedAccent, color: '#fff', opacity: 0.7, cursor: 'wait' }
                : { background: selectedAccent, color: '#fff', boxShadow: `0 4px 14px ${selectedAccent}55` }
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
              className="px-8 py-3 rounded-xl text-sm font-bold transition-opacity hover:opacity-80"
              style={onYellow
                ? { background: '#1B1A17', color: '#fff' }
                : { background: 'rgb(var(--primary))', color: '#1B1A17' }
              }
            >
              Connect wallet to vote
            </Link>
            <span className="text-xs" style={{ color: mutedClr }}>
              One vote per wallet per epoch, on-chain.
            </span>
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
