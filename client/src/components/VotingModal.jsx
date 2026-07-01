import { useState } from 'react';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useApp } from '../context/AppContext';
import { useWallet, getDappProvider } from '../hooks/useWallet';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';

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

// Charity card

const PALETTE = ['#E53E3E', '#4299E1', '#48BB78', '#ED8936', '#9F7AEA'];

const CharityCard = ({ charity, index, totalVotes, onVote, canVote, isVoted }) => {
  const pct = totalVotes > 0 ? Math.round((charity.votes / totalVotes) * 100) : 0;
  const accent = PALETTE[index % PALETTE.length];

  return (
    <button
      onClick={() => canVote && onVote(index)}
      disabled={!canVote}
      className={`
        w-full text-left rounded-xl border p-4 transition-all duration-200 group relative overflow-hidden
        ${isVoted
          ? 'border-primary bg-primaryLight shadow-[0_0_12px_rgba(229,181,71,0.3)]'
          : canVote
          ? 'border-border bg-backgroundAlt hover:border-borderStrong hover:bg-background cursor-pointer'
          : 'border-border bg-backgroundAlt cursor-default'}
      `}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: accent }} />

      <div className="pl-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-sm text-textPrimary">{charity.name}</span>
          <div className="flex items-center gap-2">
            {isVoted && (
              <span className="text-xs font-bold text-primaryDark bg-primary/20 px-2 py-0.5 rounded-full">
                Your vote
              </span>
            )}
            <span className="text-xs font-mono text-textMuted">
              {charity.votes} vote{charity.votes !== 1 ? 's' : ''} · {pct}%
            </span>
          </div>
        </div>

        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: accent }}
          />
        </div>
      </div>
    </button>
  );
};

// Modal

const VotingModal = ({ onClose }) => {
  const { epochInfo, votingState, refetchVotingState, wallet, showToast } = useApp();
  const { isConnected } = useWallet();
  const [submitting, setSubmitting] = useState(false);

  const { charities, hasVoted, userVoteIndex, loading } = votingState;
  const totalVotes = charities.reduce((s, c) => s + c.votes, 0);
  const canVote = wallet.isConnected && epochInfo.epoch > 0 && !hasVoted && charities.length > 0;

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

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-md relative overflow-hidden animate-slide-up">
        <div className="absolute top-0 left-0 right-0 h-1.5"
          style={{ background: 'linear-gradient(90deg,#E53E3E,#ED8936,#ECC94B,#48BB78,#4299E1,#9F7AEA)' }} />

        <div className="p-6 pt-7">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="font-heading text-xl font-semibold">Vote for a Charity</h2>
              <p className="text-sm text-textSecondary mt-0.5">
                Epoch {epochInfo.epoch} · Your vote decides where the EGLD goes.
              </p>
            </div>
            <button onClick={onClose} className="text-textMuted hover:text-textPrimary transition-colors text-lg leading-none mt-0.5">✕</button>
          </div>

          <div className="flex gap-4 my-4 text-xs text-textMuted">
            <span><strong className="text-textPrimary">{totalVotes}</strong> votes cast</span>
            <span><strong className="text-textPrimary">{charities.length}</strong> charities</span>
            {hasVoted && (
              <span className="text-primaryDark font-semibold">✓ You voted</span>
            )}
          </div>

          {loading ? (
            <div className="py-10 flex justify-center">
              <span className="inline-block w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : charities.length === 0 ? (
            <div className="py-8 text-center text-textMuted text-sm">
              No charities set for this epoch yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {charities.map((charity, i) => (
                <CharityCard
                  key={i}
                  charity={charity}
                  index={i}
                  totalVotes={totalVotes}
                  onVote={handleVote}
                  canVote={canVote && !submitting}
                  isVoted={hasVoted && userVoteIndex === i}
                />
              ))}
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-border">
            {!wallet.isConnected ? (
              <p className="text-xs text-textMuted text-center">Connect your wallet to vote.</p>
            ) : hasVoted ? (
              <p className="text-xs text-textMuted text-center">
                You already voted this epoch. Results update every 30 seconds.
              </p>
            ) : canVote ? (
              <p className="text-xs text-textMuted text-center">
                One vote per wallet per epoch. Transactions are on-chain.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VotingModal;
