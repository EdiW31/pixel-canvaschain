import { useState } from 'react';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useApp } from '../context/AppContext';
import { useWallet, getDappProvider } from '../hooks/useWallet';
import { Link } from 'react-router-dom';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';
const PALETTE = ['#E53E3E', '#4299E1', '#48BB78', '#ED8936', '#9F7AEA'];

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

const VotingSection = ({ compact = false }) => {
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (charities.length === 0) {
    return (
      <div className="text-center py-16 text-textMuted">
        <div className="text-4xl mb-3">🗳</div>
        <p className="text-sm">No charities have been set for epoch {epochInfo.epoch} yet.</p>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Stats row */}
      <div className={`flex flex-wrap gap-6 ${compact ? 'mb-3 text-sm' : 'mb-6'}`}>
        <div>
          <div className="text-xs text-textMuted uppercase tracking-wider mb-0.5">Total votes</div>
          <div className={`font-bold text-textPrimary ${compact ? 'text-lg' : 'text-2xl'}`}>{totalVotes}</div>
        </div>
        <div>
          <div className="text-xs text-textMuted uppercase tracking-wider mb-0.5">Charities</div>
          <div className={`font-bold text-textPrimary ${compact ? 'text-lg' : 'text-2xl'}`}>{charities.length}</div>
        </div>
        {hasVoted && (
          <div className="flex items-center">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primaryDark bg-primary/20 px-3 py-1 rounded-full">
              ✓ You voted this epoch
            </span>
          </div>
        )}
      </div>

      {/* Charity cards grid */}
      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {charities.map((charity, i) => {
          const accent = PALETTE[i % PALETTE.length];
          const pct = totalVotes > 0 ? Math.round((charity.votes / totalVotes) * 100) : 0;
          const isMyVote = hasVoted && userVoteIndex === i;

          return (
            <div
              key={i}
              className={`relative rounded-xl border overflow-hidden transition-all duration-200
                ${isMyVote ? 'border-primary shadow-[0_0_16px_rgba(229,181,71,0.35)]' : 'border-border bg-background hover:border-borderStrong'}`}
              style={{ background: isMyVote ? 'rgba(229,181,71,0.06)' : undefined }}
            >
              {/* Accent bar */}
              <div className="h-1" style={{ background: accent }} />

              <div className={compact ? 'p-4' : 'p-5'}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className={`font-semibold text-textPrimary ${compact ? 'text-sm' : 'text-base'}`}>{charity.name}</div>
                    <div className="text-xs text-textMuted mt-0.5">{charity.votes} vote{charity.votes !== 1 ? 's' : ''} · {pct}%</div>
                  </div>
                  {isMyVote && (
                    <span className="text-xs font-bold text-primaryDark bg-primary/20 px-2 py-0.5 rounded-full whitespace-nowrap">Your vote</span>
                  )}
                </div>

                {/* Vote bar */}
                <div className="h-2 rounded-full bg-border overflow-hidden mb-4">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: accent }}
                  />
                </div>

                {/* Vote button */}
                {canVote ? (
                  <button
                    onClick={() => handleVote(i)}
                    disabled={submitting}
                    className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors border
                      ${submitting ? 'opacity-50 cursor-wait border-border text-textMuted' : 'border-border hover:border-borderStrong text-textPrimary hover:bg-backgroundAlt'}`}
                    style={{ borderColor: submitting ? undefined : accent + '60', color: accent }}
                  >
                    {submitting ? 'Signing…' : `Vote for ${charity.name.split(' ')[0]}`}
                  </button>
                ) : hasVoted ? null : (
                  <Link
                    to="/login"
                    className="block w-full py-2 rounded-lg text-sm font-semibold text-center border border-border text-textMuted hover:border-borderStrong transition-colors"
                  >
                    Connect to vote
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isConnected && (
        <p className="text-xs text-textMuted text-center pt-2">
          Connect your MultiversX wallet to cast your vote on-chain.
        </p>
      )}
    </div>
  );
};

export default VotingSection;
