import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useWallet, getDappProvider } from '../hooks/useWallet';
import { useApp } from '../context/AppContext';
import Header from '../components/Header';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';
const API_URL = import.meta.env.VITE_API_URL;
const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS;

// Decode base64 returnData item to BigInt
function b64ToBigInt(b64) {
  if (!b64) return 0n;
  const hex = atob(b64).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return hex ? BigInt('0x' + hex) : 0n;
}

// Decode base64 returnData item to bech32 address
function b64ToAddress(b64) {
  if (!b64) return '';
  try {
    const hex = atob(b64).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    return Address.fromHex(hex).toBech32();
  } catch {
    return '';
  }
}

// Decode base64 returnData item to ASCII string (for token identifiers)
function b64ToString(b64) {
  if (!b64) return '';
  return atob(b64);
}

async function queryContract(funcName, args = []) {
  const res = await fetch(`${API_URL}/vm-values/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scAddress: CONTRACT_ADDRESS, funcName, args }),
  });
  const json = await res.json();
  return json.data?.data?.returnData ?? [];
}

async function sendTx(wallet, funcName, gasLimit = 10_000_000n) {
  const dappProvider = getDappProvider();
  if (!dappProvider || dappProvider.getType?.() === 'empty') {
    throw new Error('Wallet provider not ready. Please reconnect.');
  }
  const tx = new Transaction({
    nonce: 0n,
    value: 0n,
    sender: Address.newFromBech32(wallet.address),
    receiver: Address.newFromBech32(CONTRACT_ADDRESS),
    gasLimit,
    data: new TextEncoder().encode(funcName),
    chainID: CHAIN_ID,
  });
  const signed = await dappProvider.signTransactions([tx]);
  await TransactionManager.getInstance().send(signed);
}

async function sendTxWithData(wallet, data, gasLimit = 5_000_000n) {
  const dappProvider = getDappProvider();
  if (!dappProvider || dappProvider.getType?.() === 'empty') {
    throw new Error('Wallet provider not ready. Please reconnect.');
  }
  const tx = new Transaction({
    nonce: 0n,
    value: 0n,
    sender: Address.newFromBech32(wallet.address),
    receiver: Address.newFromBech32(CONTRACT_ADDRESS),
    gasLimit,
    data: new TextEncoder().encode(data),
    chainID: CHAIN_ID,
  });
  const signed = await dappProvider.signTransactions([tx]);
  await TransactionManager.getInstance().send(signed);
}

const AdminPage = () => {
  const { isConnected } = useWallet();
  const { wallet, showToast } = useApp();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Action states: 'idle' | 'pending' | 'done'
  const [distributeState, setDistributeState] = useState('idle');
  const [charityInput, setCharityInput] = useState('');
  const [charityState, setCharityState] = useState('idle');
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [denominationInput, setDenominationInput] = useState('1');
  const [tokenState, setTokenState] = useState('idle');

  useEffect(() => {
    if (!isConnected) navigate('/login');
  }, [isConnected, navigate]);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [pixelForCharity, totalDonated, charityAddr, tokenId] = await Promise.all([
        queryContract('getTotalPixelForCharity'),
        queryContract('getTotalDonated'),
        queryContract('getCharityAddress'),
        queryContract('getPixelTokenId'),
      ]);
      setStats({
        pixelForCharity: b64ToBigInt(pixelForCharity[0]),
        totalDonated: b64ToBigInt(totalDonated[0]),
        charityAddress: b64ToAddress(charityAddr[0]),
        tokenId: b64ToString(tokenId[0]),
      });
    } catch (err) {
      showToast('Failed to load contract stats', 'error');
    } finally {
      setLoadingStats(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isConnected && wallet.address === ADMIN_ADDRESS) {
      fetchStats();
    }
  }, [isConnected, wallet.address, fetchStats]);

  const isAdmin = wallet.address === ADMIN_ADDRESS;

  const handleDistribute = async () => {
    setDistributeState('pending');
    try {
      await sendTx(wallet, 'distributePixelToCharity', 10_000_000n);
      showToast('PIXEL distributed to charity successfully', 'success');
      setDistributeState('done');
      setTimeout(() => { setDistributeState('idle'); fetchStats(); }, 3000);
    } catch (err) {
      showToast(err?.message ?? 'Transaction failed', 'error');
      setDistributeState('idle');
    }
  };

  const handleSetCharity = async () => {
    if (!charityInput.startsWith('erd1')) {
      showToast('Invalid address — must start with erd1', 'error');
      return;
    }
    setCharityState('pending');
    try {
      const addrHex = Address.newFromBech32(charityInput).toHex();
      await sendTxWithData(wallet, `setCharityAddress@${addrHex}`, 5_000_000n);
      showToast('Charity address updated', 'success');
      setCharityState('done');
      setCharityInput('');
      setTimeout(() => { setCharityState('idle'); fetchStats(); }, 3000);
    } catch (err) {
      showToast(err?.message ?? 'Transaction failed', 'error');
      setCharityState('idle');
    }
  };

  const handleSetToken = async () => {
    if (!tokenIdInput.includes('-')) {
      showToast('Invalid token ID — expected format TOKEN-xxxxxx', 'error');
      return;
    }
    const denom = BigInt(denominationInput || '1');
    if (denom <= 0n) {
      showToast('Denomination must be > 0', 'error');
      return;
    }
    setTokenState('pending');
    try {
      const tokenIdHex = tokenIdInput.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      const denomHex = denom.toString(16).padStart(denom.toString(16).length % 2 === 0 ? denom.toString(16).length : denom.toString(16).length + 1, '0');
      await sendTxWithData(wallet, `setPixelToken@${tokenIdHex}@${denomHex}`, 5_000_000n);
      showToast('PIXEL token reconfigured', 'success');
      setTokenState('done');
      setTokenIdInput('');
      setDenominationInput('1');
      setTimeout(() => { setTokenState('idle'); fetchStats(); }, 3000);
    } catch (err) {
      showToast(err?.message ?? 'Transaction failed', 'error');
      setTokenState('idle');
    }
  };

  if (!isConnected) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-4xl mx-auto px-6 py-12">

        {/* Page header */}
        <div className="mb-8 animate-fade-in">
          <div className="pill mb-3 inline-flex">Admin</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mb-2">
            Contract Admin
          </h1>
          <p className="text-textSecondary">
            Owner-only operations for the Pixel CanvasChain smart contract.
          </p>
        </div>

        {/* Auth guard */}
        {!isAdmin ? (
          <div className="card p-10 text-center animate-fade-in">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="font-heading text-xl font-semibold mb-2">Not authorized</h2>
            <p className="text-textSecondary text-sm">
              This page is only accessible to the contract owner wallet.
            </p>
            <p className="text-xs text-textMuted mt-3 font-mono break-all">{wallet.address}</p>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">

            {/* Stats */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-lg font-semibold">Contract Stats</h2>
                <button
                  onClick={fetchStats}
                  disabled={loadingStats}
                  className="btn-ghost text-sm"
                >
                  {loadingStats ? '…' : '↻ Refresh'}
                </button>
              </div>

              {loadingStats && !stats ? (
                <div className="flex items-center gap-2 text-textMuted text-sm py-4">
                  <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  Loading…
                </div>
              ) : stats ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  <StatRow label="PIXEL accumulated for charity" value={stats.pixelForCharity.toLocaleString()} unit="PIXEL" emphasis />
                  <StatRow label="Total EGLD donated" value={(Number(stats.totalDonated) / 1e18).toFixed(4)} unit="EGLD" />
                  <StatRow label="Charity address" value={stats.charityAddress ? `${stats.charityAddress.slice(0, 16)}…` : '—'} mono />
                  <StatRow label="PIXEL token ID" value={stats.tokenId || '—'} mono />
                </div>
              ) : (
                <p className="text-textMuted text-sm">No data</p>
              )}
            </div>

            {/* Distribute to charity */}
            <ActionCard
              title="Distribute PIXEL to Charity"
              description={`Flushes all accumulated PIXEL tokens (${stats ? stats.pixelForCharity.toLocaleString() : '…'} PIXEL) to the current charity address.`}
              accent="#48BB78"
              tag="Epoch action"
            >
              <button
                onClick={handleDistribute}
                disabled={distributeState !== 'idle' || (stats && stats.pixelForCharity === 0n)}
                className={`btn-primary ${distributeState !== 'idle' ? 'opacity-60 cursor-wait' : ''}`}
              >
                {distributeState === 'pending' ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending…
                  </span>
                ) : distributeState === 'done' ? '✓ Done' : 'Distribute PIXEL'}
              </button>
              {stats && stats.pixelForCharity === 0n && (
                <p className="text-xs text-textMuted mt-2">No PIXEL accumulated yet.</p>
              )}
            </ActionCard>

            {/* Set charity address */}
            <ActionCard
              title="Set Charity Address"
              description="Update the wallet address that receives EGLD from purchases and PIXEL distributions."
              accent="#4299E1"
              tag="Configuration"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={charityInput}
                  onChange={e => setCharityInput(e.target.value)}
                  placeholder="erd1…"
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-backgroundAlt border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                />
                <button
                  onClick={handleSetCharity}
                  disabled={charityState !== 'idle' || !charityInput}
                  className={`btn-primary whitespace-nowrap ${charityState !== 'idle' ? 'opacity-60 cursor-wait' : ''}`}
                >
                  {charityState === 'pending' ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending…
                    </span>
                  ) : charityState === 'done' ? '✓ Done' : 'Update'}
                </button>
              </div>
            </ActionCard>

            {/* Reconfigure PIXEL token */}
            <ActionCard
              title="Reconfigure PIXEL Token"
              description="Change the ESDT token identifier and denomination used for pixel purchases. Use denomination=1 for 0-decimal tokens."
              accent="#9F7AEA"
              tag="Emergency only"
            >
              <div className="space-y-2">
                <input
                  type="text"
                  value={tokenIdInput}
                  onChange={e => setTokenIdInput(e.target.value)}
                  placeholder="TOKEN-xxxxxx"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-backgroundAlt border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={denominationInput}
                    onChange={e => setDenominationInput(e.target.value)}
                    placeholder="1"
                    min="1"
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-backgroundAlt border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button
                    onClick={handleSetToken}
                    disabled={tokenState !== 'idle' || !tokenIdInput}
                    className={`btn-primary whitespace-nowrap ${tokenState !== 'idle' ? 'opacity-60 cursor-wait' : ''}`}
                  >
                    {tokenState === 'pending' ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending…
                      </span>
                    ) : tokenState === 'done' ? '✓ Done' : 'Set Token'}
                  </button>
                </div>
                <p className="text-xs text-textMuted">Denomination: 1 for 0-decimal token, 10^18 for 18-decimal token.</p>
              </div>
            </ActionCard>

          </div>
        )}
      </main>
    </div>
  );
};

const StatRow = ({ label, value, unit, emphasis, mono }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-textMuted uppercase tracking-wider font-medium">{label}</span>
    <span className={`font-semibold ${emphasis ? 'text-charityDark text-xl' : 'text-textPrimary'} ${mono ? 'font-mono text-sm' : ''}`}>
      {value} {unit && <span className="text-xs font-normal text-textMuted">{unit}</span>}
    </span>
  </div>
);

const ActionCard = ({ title, description, accent, tag, children }) => (
  <div className="card p-6 overflow-hidden relative">
    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: accent }} />
    <div className="pill mb-3 mt-2 inline-flex">{tag}</div>
    <h3 className="font-heading text-lg font-semibold mb-1">{title}</h3>
    <p className="text-sm text-textSecondary mb-4">{description}</p>
    {children}
  </div>
);

export default AdminPage;
