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
    return Address.newFromHex(hex).toBech32();
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

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:5001';

function toHex(str) {
  return str.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}
function numToHex(n) {
  const hex = Number(n).toString(16);
  return hex.length % 2 === 0 ? hex : '0' + hex;
}

const AdminPage = () => {
  const { isConnected } = useWallet();
  const { wallet, showToast, epochInfo, refetchEpochInfo } = useApp();
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

  // Epoch actions
  const [startEpochState, setStartEpochState] = useState('idle');
  const [endEpochState, setEndEpochState] = useState('idle');
  const [epochDurationInput, setEpochDurationInput] = useState('86400');
  const [epochDurationState, setEpochDurationState] = useState('idle');

  // Charity voting setup
  const [charityRows, setCharityRows] = useState([{ name: '', address: '', photoUrl: '', link: '' }]);
  const [charityEpochInput, setCharityEpochInput] = useState('');
  const [setCharitiesState, setSetCharitiesState] = useState('idle');

  // Auto-populate epoch input once stats are known
  useEffect(() => {
    if (stats?.epoch && !charityEpochInput) {
      setCharityEpochInput(String(stats.epoch));
    }
  }, [stats?.epoch]);

  useEffect(() => {
    if (!isConnected) navigate('/login');
  }, [isConnected, navigate]);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [pixelForCharity, totalDonated, charityAddr, tokenId, epochData, startTs, epochDur] = await Promise.all([
        queryContract('getTotalPixelForCharity'),
        queryContract('getTotalDonated'),
        queryContract('getCharityAddress'),
        queryContract('getPixelTokenId'),
        queryContract('getCurrentEpoch'),
        queryContract('getEpochStartTimestamp'),
        queryContract('getEpochDuration'),
      ]);
      const epoch = Number(b64ToBigInt(epochData[0]));
      const startTimestamp = Number(b64ToBigInt(startTs[0]));
      const durationSeconds = Number(b64ToBigInt(epochDur[0]));
      const endsAt = startTimestamp > 0 ? new Date((startTimestamp + durationSeconds) * 1000) : null;
      setStats({
        pixelForCharity: b64ToBigInt(pixelForCharity[0]),
        totalDonated: b64ToBigInt(totalDonated[0]),
        charityAddress: b64ToAddress(charityAddr[0]),
        tokenId: b64ToString(tokenId[0]),
        epoch,
        startTimestamp,
        durationSeconds,
        endsAt,
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

  const handleStartEpoch = async () => {
    setStartEpochState('pending');
    try {
      await sendTx(wallet, 'startEpoch', 5_000_000n);
      showToast('Epoch started successfully', 'success');
      setStartEpochState('done');
      setTimeout(() => { setStartEpochState('idle'); fetchStats(); refetchEpochInfo(); }, 3000);
    } catch (err) {
      showToast(err?.message ?? 'Transaction failed', 'error');
      setStartEpochState('idle');
    }
  };

  const handleEndEpoch = async () => {
    setEndEpochState('pending');
    try {
      // Fetch canvas PNG URI from server to embed as NFT metadata
      const nftUri = `${SERVER_URL}/canvas/png`;
      const nftUriHex = toHex(nftUri);
      await sendTxWithData(wallet, `endEpoch@${nftUriHex}`, 10_000_000n);
      showToast('Epoch ended — PIXEL distributed to charity', 'success');
      setEndEpochState('done');
      setTimeout(() => { setEndEpochState('idle'); fetchStats(); refetchEpochInfo(); }, 3000);
    } catch (err) {
      showToast(err?.message ?? 'Transaction failed', 'error');
      setEndEpochState('idle');
    }
  };

  const handleSetEpochDuration = async () => {
    const seconds = parseInt(epochDurationInput, 10);
    if (!seconds || seconds <= 0) { showToast('Invalid duration', 'error'); return; }
    setEpochDurationState('pending');
    try {
      await sendTxWithData(wallet, `setEpochDuration@${numToHex(seconds)}`, 5_000_000n);
      showToast(`Epoch duration set to ${seconds}s`, 'success');
      setEpochDurationState('done');
      setTimeout(() => { setEpochDurationState('idle'); fetchStats(); }, 3000);
    } catch (err) {
      showToast(err?.message ?? 'Transaction failed', 'error');
      setEpochDurationState('idle');
    }
  };

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

  const handleSetCharities = async () => {
    const epoch = parseInt(charityEpochInput, 10);
    if (!epoch || epoch <= 0) { showToast('Enter a valid epoch number', 'error'); return; }
    const validRows = charityRows.filter(r => r.name.trim() && r.address.trim());
    if (validRows.length === 0) { showToast('Add at least one charity', 'error'); return; }
    for (const r of validRows) {
      if (!r.address.startsWith('erd1')) { showToast(`Invalid address: ${r.address}`, 'error'); return; }
    }
    setSetCharitiesState('pending');
    try {
      const epochHex = numToHex(epoch);

      // ManagedVec<ManagedBuffer> nested encoding: (4-byte len + bytes) per item, no count prefix
      const encodeListBytes = (names) => {
        let hex = '';
        for (const name of names) {
          const bytes = new TextEncoder().encode(name);
          hex += bytes.length.toString(16).padStart(8, '0');
          hex += Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        return hex;
      };

      // ManagedVec<ManagedAddress> nested encoding: 32 raw bytes per item, no count prefix
      const encodeListAddrs = (addrHexes) => addrHexes.join('');

      const addrHexes = [];
      for (const r of validRows) {
        try {
          addrHexes.push(Address.newFromBech32(r.address.trim()).toHex());
        } catch {
          showToast(`Invalid address: ${r.address.trim()}`, 'error');
          setSetCharitiesState('idle');
          return;
        }
      }

      const namesContainer = encodeListBytes(validRows.map(r => r.name.trim()));
      const addrsContainer = encodeListAddrs(addrHexes);
      const data = `setEpochCharities@${epochHex}@${namesContainer}@${addrsContainer}`;
      await sendTxWithData(wallet, data, 20_000_000n);

      // Store photo + link metadata in localStorage (not in contract)
      const meta = validRows.map(r => ({ photoUrl: r.photoUrl.trim(), link: r.link.trim() }));
      localStorage.setItem(`charity_meta_epoch_${epoch}`, JSON.stringify(meta));

      showToast(`Charities set for epoch ${epoch}`, 'success');
      setSetCharitiesState('done');
      setTimeout(() => setSetCharitiesState('idle'), 3000);
    } catch (err) {
      showToast(err?.message ?? 'Transaction failed', 'error');
      setSetCharitiesState('idle');
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
                  <StatRow label="Current epoch" value={stats.epoch > 0 ? `#${stats.epoch}` : 'Not started'} emphasis={stats.epoch > 0} />
                  <StatRow label="Epoch ends" value={stats.endsAt ? stats.endsAt.toLocaleString() : '—'} />
                  <StatRow label="Epoch duration" value={`${stats.durationSeconds}s (${(stats.durationSeconds / 3600).toFixed(1)}h)`} />
                  <StatRow label="PIXEL accumulated for charity" value={stats.pixelForCharity.toLocaleString()} unit="PIXEL" />
                  <StatRow label="Total EGLD donated" value={(Number(stats.totalDonated) / 1e18).toFixed(4)} unit="EGLD" />
                  <StatRow label="Charity address" value={stats.charityAddress ? `${stats.charityAddress.slice(0, 16)}…` : '—'} mono />
                  <StatRow label="PIXEL token ID" value={stats.tokenId || '—'} mono />
                </div>
              ) : (
                <p className="text-textMuted text-sm">No data</p>
              )}
            </div>

            {/* ── Epoch controls ─────────────────────────────────────── */}
            <ActionCard
              title="Start New Epoch"
              description="Increments the epoch counter, resets the painter leaderboard, and records the start timestamp. Run this at the beginning of each epoch."
              accent="#ED8936"
              tag="Epoch"
            >
              <button
                onClick={handleStartEpoch}
                disabled={startEpochState !== 'idle'}
                className={`btn-primary ${startEpochState !== 'idle' ? 'opacity-60 cursor-wait' : ''}`}
              >
                {startEpochState === 'pending' ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending…
                  </span>
                ) : startEpochState === 'done' ? '✓ Epoch started' : `Start Epoch ${(stats?.epoch ?? 0) + 1}`}
              </button>
            </ActionCard>

            <ActionCard
              title="End Epoch"
              description="Distributes all accumulated PIXEL tokens to charity and emits an epoch-ended event. The server's canvas PNG URL is passed as the NFT URI for future NFT minting."
              accent="#E53E3E"
              tag="Epoch"
            >
              <button
                onClick={handleEndEpoch}
                disabled={endEpochState !== 'idle' || !stats?.epoch}
                className={`btn-primary ${endEpochState !== 'idle' ? 'opacity-60 cursor-wait' : ''}`}
              >
                {endEpochState === 'pending' ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending…
                  </span>
                ) : endEpochState === 'done' ? '✓ Epoch ended' : `End Epoch ${stats?.epoch ?? '—'}`}
              </button>
              {!stats?.epoch && <p className="text-xs text-textMuted mt-2">No active epoch to end.</p>}
            </ActionCard>

            <ActionCard
              title="Set Epoch Duration"
              description="Configure how long each epoch lasts in seconds. Use 86400 for 24h. Use a small value (e.g. 300) for quick devnet testing."
              accent="#9F7AEA"
              tag="Configuration"
            >
              <div className="flex gap-2">
                <input
                  type="number"
                  value={epochDurationInput}
                  onChange={e => setEpochDurationInput(e.target.value)}
                  placeholder="86400"
                  min="1"
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-backgroundAlt border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={handleSetEpochDuration}
                  disabled={epochDurationState !== 'idle'}
                  className={`btn-primary whitespace-nowrap ${epochDurationState !== 'idle' ? 'opacity-60 cursor-wait' : ''}`}
                >
                  {epochDurationState === 'pending' ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending…
                    </span>
                  ) : epochDurationState === 'done' ? '✓ Set' : 'Set Duration'}
                </button>
              </div>
              <p className="text-xs text-textMuted mt-1">Current: {stats?.durationSeconds ?? '…'}s</p>
            </ActionCard>

            {/* ── Set Epoch Charities ───────────────────────────── */}
            <ActionCard
              title="Set Epoch Charities"
              description="Define up to 5 charity candidates for an epoch. Each one will appear as a voting option. Fill in name + wallet address, then click Set."
              accent="#48BB78"
              tag="Voting"
            >
              <div className="space-y-4">
                {/* Epoch picker */}
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-textMuted whitespace-nowrap">For epoch #</label>
                  <input
                    type="number"
                    value={charityEpochInput}
                    onChange={e => setCharityEpochInput(e.target.value)}
                    placeholder={stats?.epoch ? String(stats.epoch) : '1'}
                    min="1"
                    className="w-24 px-3 py-1.5 text-sm rounded-lg bg-backgroundAlt border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                {/* Charity rows */}
                <div className="space-y-3">
                  {charityRows.map((row, i) => {
                    const complete = row.name.trim() && row.address.trim();
                    return (
                      <div
                        key={i}
                        className="rounded-xl border p-4 flex gap-4 transition-colors"
                        style={{
                          borderColor: complete ? '#48BB78' : 'rgb(var(--border))',
                          background: complete ? 'rgba(72,187,120,0.04)' : 'rgb(var(--bg-alt))',
                        }}
                      >
                        {/* Photo preview */}
                        <div
                          className="flex-shrink-0 w-16 h-20 rounded-xl overflow-hidden border"
                          style={{ borderColor: 'rgb(var(--border))' }}
                        >
                          {row.photoUrl?.trim() ? (
                            <img
                              src={row.photoUrl.trim()}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                            />
                          ) : null}
                          <div
                            className="w-full h-full items-center justify-center text-2xl"
                            style={{
                              display: row.photoUrl?.trim() ? 'none' : 'flex',
                              background: `${['#E53E3E','#4299E1','#48BB78','#ED8936','#9F7AEA'][i % 5]}18`,
                            }}
                          >
                            {['❤','🌊','🌿','☀','✦'][i % 5]}
                          </div>
                        </div>

                        {/* Fields */}
                        <div className="flex flex-col gap-2 flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-textMuted">
                              Charity {i + 1}
                              {complete && <span className="ml-2 text-[#48BB78]">✓ ready</span>}
                            </span>
                            {charityRows.length > 1 && (
                              <button
                                onClick={() => setCharityRows(prev => prev.filter((_, j) => j !== i))}
                                className="text-xs text-textMuted hover:text-error transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={row.name}
                            onChange={e => setCharityRows(prev => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                            placeholder="Charity name (e.g. UNICEF)"
                            className="w-full px-3 py-1.5 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <input
                            type="text"
                            value={row.address}
                            onChange={e => setCharityRows(prev => prev.map((r, j) => j === i ? { ...r, address: e.target.value } : r))}
                            placeholder="erd1… wallet address"
                            className="w-full px-3 py-1.5 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono text-xs"
                          />
                          <div className="flex gap-2">
                            <input
                              type="url"
                              value={row.photoUrl ?? ''}
                              onChange={e => setCharityRows(prev => prev.map((r, j) => j === i ? { ...r, photoUrl: e.target.value } : r))}
                              placeholder="Photo URL (https://…)"
                              className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            <input
                              type="url"
                              value={row.link ?? ''}
                              onChange={e => setCharityRows(prev => prev.map((r, j) => j === i ? { ...r, link: e.target.value } : r))}
                              placeholder="Website link"
                              className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add row button */}
                {charityRows.length < 5 && (
                  <button
                    onClick={() => setCharityRows(prev => [...prev, { name: '', address: '', photoUrl: '', link: '' }])}
                    className="w-full py-2 rounded-xl border-2 border-dashed text-sm font-medium transition-colors hover:border-[#48BB78] hover:text-[#48BB78]"
                    style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--text-muted))' }}
                  >
                    + Add another charity ({charityRows.length}/5)
                  </button>
                )}

                {/* Submit */}
                {(() => {
                  const readyCount = charityRows.filter(r => r.name.trim() && r.address.trim()).length;
                  return (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-textMuted">
                        {readyCount === 0
                          ? 'Fill in at least one charity to submit'
                          : `${readyCount} charit${readyCount === 1 ? 'y' : 'ies'} will be set on-chain`}
                      </span>
                      <button
                        onClick={handleSetCharities}
                        disabled={setCharitiesState !== 'idle' || readyCount === 0}
                        className={`btn-primary ${(setCharitiesState !== 'idle' || readyCount === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {setCharitiesState === 'pending' ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending…
                          </span>
                        ) : setCharitiesState === 'done'
                          ? '✓ Charities set'
                          : `Set ${readyCount || ''} Charit${readyCount === 1 ? 'y' : 'ies'}`}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </ActionCard>

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
