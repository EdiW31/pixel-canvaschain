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

// onYellow=true → white cards, fixed dark text (used when section bg is yellow)
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className={`inline-block w-8 h-8 border-2 rounded-full animate-spin ${
          onYellow ? 'border-[rgba(27,26,23,0.2)] border-t-[#1B1A17]' : 'border-primary/30 border-t-primary'
        }`} />
      </div>
    );
  }

  if (charities.length === 0) {
    return (
      <div className="text-center py-16" style={{ color: onYellow ? 'rgba(27,26,23,0.55)' : undefined }}>
        <div className={`text-4xl mb-3 ${!onYellow ? 'text-textMuted' : ''}`}>🗳</div>
        <p className="text-sm">No charities set for epoch {epochInfo.epoch} yet.</p>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Stats row */}
      <div className={`flex flex-wrap gap-6 ${compact ? 'mb-3' : 'mb-6'}`}>
        <div>
          <div className={`text-xs uppercase tracking-wider mb-0.5 ${onYellow ? '' : 'text-textMuted'}`}
            style={onYellow ? { color: 'rgba(27,26,23,0.55)' } : undefined}>
            Total votes
          </div>
          <div className={`font-bold ${compact ? 'text-lg' : 'text-2xl'} ${onYellow ? '' : 'text-textPrimary'}`}
            style={onYellow ? { color: '#1B1A17' } : undefined}>
            {totalVotes}
          </div>
        </div>
        <div>
          <div className={`text-xs uppercase tracking-wider mb-0.5 ${onYellow ? '' : 'text-textMuted'}`}
            style={onYellow ? { color: 'rgba(27,26,23,0.55)' } : undefined}>
            Charities
          </div>
          <div className={`font-bold ${compact ? 'text-lg' : 'text-2xl'} ${onYellow ? '' : 'text-textPrimary'}`}
            style={onYellow ? { color: '#1B1A17' } : undefined}>
            {charities.length}
          </div>
        </div>
        {hasVoted && (
          <div className="flex items-center">
            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${
              onYellow ? '' : 'text-primaryDark bg-primary/20'
            }`}
              style={onYellow ? { background: 'rgba(27,26,23,0.15)', color: '#1B1A17' } : undefined}>
              ✓ You voted this epoch
            </span>
          </div>
        )}
      </div>

      {/* Charity cards grid */}
      <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {charities.map((charity, i) => {
          const accent = PALETTE[i % PALETTE.length];
          const pct = totalVotes > 0 ? Math.round((charity.votes / totalVotes) * 100) : 0;
          const isMyVote = hasVoted && userVoteIndex === i;

          return (
            <div
              key={i}
              className={`relative rounded-xl overflow-hidden transition-all duration-200 ${
                onYellow
                  ? 'shadow-sm hover:shadow-md'
                  : isMyVote
                  ? 'shadow-[0_0_16px_rgba(229,181,71,0.35)]'
                  : 'bg-background border border-border hover:border-borderStrong'
              }`}
              style={{
                background: onYellow ? '#FFFFFF' : isMyVote ? 'rgba(229,181,71,0.06)' : undefined,
                border: onYellow
                  ? isMyVote ? `2px solid ${accent}` : '1.5px solid rgba(27,26,23,0.12)'
                  : isMyVote ? '2px solid rgb(var(--primary))'
                  : undefined,
              }}
            >
              {/* Accent bar */}
              <div className="h-1.5" style={{ background: accent }} />

              <div className={compact ? 'p-4' : 'p-5'}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className={`font-semibold ${compact ? 'text-sm' : 'text-base'} ${onYellow ? '' : 'text-textPrimary'}`}
                      style={onYellow ? { color: '#1B1A17' } : undefined}>
                      {charity.name}
                    </div>
                    <div className={`text-xs mt-0.5 ${onYellow ? '' : 'text-textMuted'}`}
                      style={onYellow ? { color: 'rgba(27,26,23,0.55)' } : undefined}>
                      {charity.votes} vote{charity.votes !== 1 ? 's' : ''} · {pct}%
                    </div>
                  </div>
                  {isMyVote && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      onYellow ? '' : 'text-primaryDark bg-primary/20'
                    }`}
                      style={onYellow ? { background: accent + '22', color: accent } : undefined}>
                      Your vote ✓
                    </span>
                  )}
                </div>

                {/* Vote bar */}
                <div className="h-2 rounded-full overflow-hidden mb-4"
                  style={{ background: onYellow ? 'rgba(27,26,23,0.1)' : 'rgb(var(--border))' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: accent }}
                  />
                </div>

                {/* Vote / Connect button */}
                {canVote ? (
                  <button
                    onClick={() => handleVote(i)}
                    disabled={submitting}
                    className="w-full py-2 rounded-lg text-sm font-bold transition-all duration-150 border-2"
                    style={submitting
                      ? { opacity: 0.5, cursor: 'wait', borderColor: 'rgba(27,26,23,0.2)', color: 'rgba(27,26,23,0.35)' }
                      : { borderColor: accent, color: '#1B1A17', background: 'transparent' }
                    }
                    onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = accent + '22'; }}
                    onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {submitting ? 'Signing…' : `Vote for ${charity.name.split(' ')[0]}`}
                  </button>
                ) : hasVoted ? null : (
                  <Link
                    to="/login"
                    className="block w-full py-2 rounded-lg text-sm font-semibold text-center border-2 transition-colors hover:opacity-80"
                    style={{ borderColor: 'rgba(27,26,23,0.2)', color: onYellow ? '#1B1A17' : undefined }}
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
        <p className={`text-xs text-center pt-2 ${onYellow ? '' : 'text-textMuted'}`}
          style={onYellow ? { color: 'rgba(27,26,23,0.5)' } : undefined}>
          Connect your MultiversX wallet to cast your vote on-chain.
        </p>
      )}
    </div>
  );
};

export default VotingSection;
