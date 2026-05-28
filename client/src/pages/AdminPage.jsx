import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useWallet, getDappProvider } from '../hooks/useWallet';
import { useApp } from '../context/AppContext';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';
const API_URL = import.meta.env.VITE_API_URL;
const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS;
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:5001';

/* ── Encoding helpers ─────────────────────────────────────────────────────── */
function b64ToBigInt(b64) {
  if (!b64) return 0n;
  const hex = atob(b64).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return hex ? BigInt('0x' + hex) : 0n;
}
function b64ToAddress(b64) {
  if (!b64) return '';
  try {
    const hex = atob(b64).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    return Address.newFromHex(hex).toBech32();
  } catch { return ''; }
}
function b64ToString(b64) {
  if (!b64) return '';
  return atob(b64);
}
function toHex(str) {
  return str.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}
function numToHex(n) {
  const hex = Number(n).toString(16);
  return hex.length % 2 === 0 ? hex : '0' + hex;
}
function fmtDuration(s) {
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} d`;
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
  if (!dappProvider || dappProvider.getType?.() === 'empty') throw new Error('Wallet provider not ready.');
  const tx = new Transaction({
    nonce: 0n, value: 0n,
    sender: Address.newFromBech32(wallet.address),
    receiver: Address.newFromBech32(CONTRACT_ADDRESS),
    gasLimit, data: new TextEncoder().encode(funcName), chainID: CHAIN_ID,
  });
  const signed = await dappProvider.signTransactions([tx]);
  await TransactionManager.getInstance().send(signed);
}

async function sendTxWithData(wallet, data, gasLimit = 5_000_000n) {
  const dappProvider = getDappProvider();
  if (!dappProvider || dappProvider.getType?.() === 'empty') throw new Error('Wallet provider not ready.');
  const tx = new Transaction({
    nonce: 0n, value: 0n,
    sender: Address.newFromBech32(wallet.address),
    receiver: Address.newFromBech32(CONTRACT_ADDRESS),
    gasLimit, data: new TextEncoder().encode(data), chainID: CHAIN_ID,
  });
  const signed = await dappProvider.signTransactions([tx]);
  await TransactionManager.getInstance().send(signed);
}

/* ── Tabs ─────────────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'overview', label: 'Overview',    icon: '◈' },
  { id: 'start',    label: 'Start Epoch', icon: '▶' },
  { id: 'end',      label: 'End Epoch',   icon: '■' },
  { id: 'config',   label: 'Config',      icon: '⚙' },
  { id: 'advanced', label: 'Advanced',    icon: '⚒' },
];

/* ══════════════════════════════════════════════════════════════════════════ */
const AdminPage = () => {
  const { isConnected } = useWallet();
  const { wallet, showToast, refetchEpochInfo } = useApp();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats]         = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  /* form state */
  const [charityInput, setCharityInput]           = useState('');
  const [charityState, setCharityState]           = useState('idle');
  const [tokenIdInput, setTokenIdInput]           = useState('');
  const [denominationInput, setDenominationInput] = useState('1');
  const [tokenState, setTokenState]               = useState('idle');
  const [epochDurationInput, setEpochDurationInput]   = useState('86400');
  const [epochDurationState, setEpochDurationState]   = useState('idle');
  const [auctionDurationInput, setAuctionDurationInput] = useState('300');
  const [auctionDurationState, setAuctionDurationState] = useState('idle');
  const [nftCollectionInput, setNftCollectionInput] = useState('');
  const [setNftState, setSetNftState]               = useState('idle');

  /* epoch action state */
  const [endEpochState, setEndEpochState] = useState('idle');
  const [endEpochStep, setEndEpochStep]   = useState('');
  const [lastNftUrl, setLastNftUrl]       = useState('');

  /* auction */
  const [auctionSectionX, setAuctionSectionX] = useState('40');
  const [auctionSectionY, setAuctionSectionY] = useState('40');
  const [startAuctionState, setStartAuctionState] = useState('idle');
  const [closeAuctionState, setCloseAuctionState] = useState('idle');
  const [auctionInfo, setAuctionInfo]             = useState(null);

  /* charities */
  const [charityRows, setCharityRows]         = useState([{ name: '', address: '', photoUrl: '', link: '' }]);
  const [charityEpochInput, setCharityEpochInput] = useState('');
  const [setCharitiesState, setSetCharitiesState] = useState('idle');

  useEffect(() => {
    if (stats?.epoch && !charityEpochInput) setCharityEpochInput(String(stats.epoch));
  }, [stats?.epoch]); // eslint-disable-line

  useEffect(() => { if (!isConnected) navigate('/login'); }, [isConnected, navigate]);

  /* ── Fetch ─────────────────────────────────────────────────────────────── */
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [
        pixelForCharity, totalDonated, charityAddr, tokenId,
        epochData, startTs, epochDur, auctionDur, egldPending,
      ] = await Promise.all([
        queryContract('getTotalPixelForCharity'),
        queryContract('getTotalDonated'),
        queryContract('getCharityAddress'),
        queryContract('getPixelTokenId'),
        queryContract('getCurrentEpoch'),
        queryContract('getEpochStartTimestamp'),
        queryContract('getEpochDuration'),
        queryContract('getAuctionDurationSeconds'),
        queryContract('getTotalEgldForCharity'),
      ]);

      const epoch            = Number(b64ToBigInt(epochData[0]));
      const startTimestamp   = Number(b64ToBigInt(startTs[0]));
      const durationSeconds  = Number(b64ToBigInt(epochDur[0]));
      const auctionDurationSeconds = Number(b64ToBigInt(auctionDur[0]));
      const endsAt = startTimestamp > 0 ? new Date((startTimestamp + durationSeconds) * 1000) : null;

      /* vote tallies for current epoch */
      let voteTallies = [];
      if (epoch > 0) {
        try {
          const raw = await queryContract('getVoteTallies', [numToHex(epoch)]);
          const names = (() => { try { return JSON.parse(localStorage.getItem(`charity_names_epoch_${epoch}`) || '[]'); } catch { return []; } })();
          voteTallies = raw.map((t, i) => ({
            name: names[i] || `Charity ${i + 1}`,
            votes: Number(b64ToBigInt(t)),
          }));
        } catch (_) {}
      }

      /* server canvas stats */
      let serverStats = null;
      try {
        const sr = await fetch(`${SERVER_URL}/stats`, { signal: AbortSignal.timeout(3000) });
        if (sr.ok) serverStats = await sr.json();
      } catch (_) {}

      /* epoch history (last N epochs) for donated bar chart */
      const epochHistory = [];
      if (epoch > 0) {
        for (let e = Math.max(1, epoch - 4); e <= epoch; e++) {
          epochHistory.push({ epoch: `#${e}`, donated: 0 }); // placeholder — contract has no per-epoch donation view
        }
      }

      setStats({
        pixelForCharity:     b64ToBigInt(pixelForCharity[0]),
        totalDonated:        b64ToBigInt(totalDonated[0]),
        egldPending:         b64ToBigInt(egldPending[0]),
        charityAddress:      b64ToAddress(charityAddr[0]),
        tokenId:             b64ToString(tokenId[0]),
        epoch, startTimestamp, durationSeconds, auctionDurationSeconds, endsAt,
        voteTallies, serverStats,
      });

      if (epoch > 0) {
        try {
          const epochHex   = numToHex(epoch);
          const auctionData = await queryContract('getAuctionState', [epochHex]);
          if (auctionData?.length >= 7) {
            const active      = auctionData[0] ? atob(auctionData[0]).charCodeAt(0) === 1 : false;
            const highestBid  = b64ToBigInt(auctionData[5]);
            const winner      = b64ToAddress(auctionData[6]);
            const endTs       = Number(b64ToBigInt(auctionData[3]));
            const sx          = Number(b64ToBigInt(auctionData[1]));
            const sy          = Number(b64ToBigInt(auctionData[2]));
            setAuctionInfo({ active, highestBid, winner, endTs, sx, sy });
          }
        } catch (_) {}
      } else {
        setAuctionInfo(null);
      }
    } catch {
      showToast('Failed to load contract stats', 'error');
    } finally {
      setLoadingStats(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isConnected && wallet.address === ADMIN_ADDRESS) fetchStats();
  }, [isConnected, wallet.address, fetchStats]);

  const isAdmin = wallet.address === ADMIN_ADDRESS;

  /* ── Handlers ─────────────────────────────────────────────────────────── */
  const handleStartEpochWithAuction = async () => {
    const x = parseInt(auctionSectionX, 10);
    const y = parseInt(auctionSectionY, 10);
    if (isNaN(x) || x < 0 || x > 80) { showToast('Section X must be 0–80', 'error'); return; }
    if (isNaN(y) || y < 0 || y > 80) { showToast('Section Y must be 0–80', 'error'); return; }
    setStartAuctionState('pending');
    try {
      await sendTxWithData(wallet, `startEpochWithAuction@${numToHex(x)}@${numToHex(y)}`, 10_000_000n);
      showToast('Epoch with auction started!', 'success');
      setStartAuctionState('done');
      setTimeout(() => { setStartAuctionState('idle'); fetchStats(); refetchEpochInfo(); }, 3000);
    } catch (err) { showToast(err?.message ?? 'Transaction failed', 'error'); setStartAuctionState('idle'); }
  };

  const handleCloseAuction = async () => {
    setCloseAuctionState('pending');
    try {
      await sendTx(wallet, 'closeAuction', 10_000_000n);
      showToast('Auction closed — winner can now paint their zone', 'success');
      setCloseAuctionState('done');
      setTimeout(() => { setCloseAuctionState('idle'); fetchStats(); }, 3000);
    } catch (err) { showToast(err?.message ?? 'Transaction failed', 'error'); setCloseAuctionState('idle'); }
  };

  const handleSetNftCollection = async () => {
    if (!nftCollectionInput.includes('-')) { showToast('Invalid token ID — expected TOKEN-xxxxxx', 'error'); return; }
    setSetNftState('pending');
    try {
      await sendTxWithData(wallet, `setNftCollection@${toHex(nftCollectionInput)}`, 5_000_000n);
      showToast('NFT collection set', 'success');
      setSetNftState('done');
      setNftCollectionInput('');
      setTimeout(() => setSetNftState('idle'), 3000);
    } catch (err) { showToast(err?.message ?? 'Transaction failed', 'error'); setSetNftState('idle'); }
  };

  const handleEndEpoch = async () => {
    // Defend against UI race conditions (button held / double-click) that
    // could fire endEpoch twice and mint duplicate NFT pairs. The contract
    // also has an `epoch_ended` guard for safety.
    if (endEpochState === 'pending') return;
    setEndEpochState('pending');
    setEndEpochStep('snapshotting');
    setLastNftUrl('');
    try {
      // Auction zone coords — sx/sy come from getAuctionState (set in fetchStats).
      // Fall back to (40,40) only if absolutely no zone info is available.
      const sx = Number.isFinite(auctionInfo?.sx) ? auctionInfo.sx : 40;
      const sy = Number.isFinite(auctionInfo?.sy) ? auctionInfo.sy : 40;

      // Current epoch number — used to name the per-epoch snapshot. If for
      // some reason we don't have a fresh value, refuse rather than guess.
      const epoch = Number(stats?.epoch ?? 0);
      if (!epoch || epoch <= 0) {
        showToast('Cannot determine current epoch number — refresh and retry', 'error');
        setEndEpochState('idle');
        setEndEpochStep('');
        return;
      }

      // STEP 1 — Write the immutable per-epoch snapshot to the server's
      // local `snapshots/` dir. Always-succeeds path that gives us a
      // PER-EPOCH stable URL even when the public-host upload fails.
      // This is also our fallback URI for the NFT — much better than the
      // old `${SERVER_URL}/canvas/png` (a live endpoint that changes after
      // every paint and every canvas wipe).
      const snapRes = await fetch(`${SERVER_URL}/snapshots/epoch/${epoch}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sx, sy, w: 20, h: 20, scale: 32 }),
      });
      // Fallbacks default to the per-epoch snapshot URL (local only — won't
      // render on devnet explorer, but the website does via NftPage's
      // resolveImageUrl which substitutes snapshot paths). Caller still
      // gets a meaningful, per-epoch-frozen URI.
      let painterUri = `${SERVER_URL}/snapshots/epoch/${epoch}/canvas.png`;
      let auctionUri = `${SERVER_URL}/snapshots/epoch/${epoch}/zone.png`;
      if (!snapRes.ok) {
        const txt = await snapRes.text().catch(() => '');
        console.warn('[endEpoch] snapshot write failed — keeping default fallback URIs:', snapRes.status, txt.slice(0, 200));
        showToast(`Snapshot write failed (${snapRes.status}) — continuing with live URL fallback`, 'info');
        // Drop back to the very old live-endpoint URLs since snapshots
        // aren't on disk; at least the demo works locally.
        painterUri = `${SERVER_URL}/canvas/png`;
        auctionUri = `${SERVER_URL}/canvas/section-png?x=${sx}&y=${sy}&w=20&h=20`;
      }

      // STEP 2 — TRY to upload both images to a public host (catbox →
      // 0x0.st inside the server). If either succeeds, prefer its https
      // URL over the local fallback. If both fail, we still ship the
      // local URI — broken on the explorer, but the website renders fine.
      setEndEpochStep('uploading-painter');
      const [painterRes, auctionRes] = await Promise.allSettled([
        fetch(`${SERVER_URL}/canvas/upload`, { method: 'POST' }),
        fetch(`${SERVER_URL}/canvas/upload-section`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: sx, y: sy, w: 20, h: 20, scale: 32 }),
        }),
      ]);

      if (painterRes.status === 'fulfilled' && painterRes.value.ok) {
        const { url } = await painterRes.value.json().catch(() => ({}));
        if (url?.startsWith('https://')) painterUri = url;
        else console.warn('[endEpoch] painter upload returned non-https URL — using snapshot fallback');
      } else {
        console.warn('[endEpoch] painter upload failed — using snapshot fallback');
      }
      setEndEpochStep('uploading-auction');
      if (auctionRes.status === 'fulfilled' && auctionRes.value.ok) {
        const { url } = await auctionRes.value.json().catch(() => ({}));
        if (url?.startsWith('https://')) auctionUri = url;
        else console.warn('[endEpoch] auction upload returned non-https URL — using snapshot fallback');
      } else {
        console.warn('[endEpoch] auction upload failed — using snapshot fallback');
      }

      setLastNftUrl({ painter: painterUri, auction: auctionUri });

      setEndEpochStep('signing');
      // endEpoch@<painterUri hex>@<auctionUri hex>
      await sendTxWithData(
        wallet,
        `endEpoch@${toHex(painterUri)}@${toHex(auctionUri)}`,
        100_000_000n,
      );
      showToast('Epoch ended — PIXEL & EGLD distributed, NFTs minted, canvas resetting…', 'success');
      setEndEpochState('done');
      setEndEpochStep('');
      setTimeout(() => { setEndEpochState('idle'); fetchStats(); refetchEpochInfo(); }, 3000);
      // Devnet confirmation takes ~6–15s — refetch again to catch the updated
      // epoch_duration_seconds=1 that endEpoch writes, which makes the
      // epoch-ended banner appear.
      setTimeout(() => { refetchEpochInfo(); fetchStats(); }, 15_000);
    } catch (err) {
      showToast(err?.message ?? 'Transaction failed', 'error');
      setEndEpochState('idle');
      setEndEpochStep('');
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
    } catch (err) { showToast(err?.message ?? 'Transaction failed', 'error'); setEpochDurationState('idle'); }
  };

  const handleSetAuctionDuration = async () => {
    const seconds = parseInt(auctionDurationInput, 10);
    if (!seconds || seconds <= 0) { showToast('Invalid duration', 'error'); return; }
    setAuctionDurationState('pending');
    try {
      await sendTxWithData(wallet, `setAuctionDuration@${numToHex(seconds)}`, 5_000_000n);
      showToast(`Auction duration set to ${seconds}s`, 'success');
      setAuctionDurationState('done');
      setTimeout(() => { setAuctionDurationState('idle'); fetchStats(); }, 3000);
    } catch (err) { showToast(err?.message ?? 'Transaction failed', 'error'); setAuctionDurationState('idle'); }
  };

  const handleSetCharity = async () => {
    if (!charityInput.startsWith('erd1')) { showToast('Invalid address', 'error'); return; }
    setCharityState('pending');
    try {
      const addrHex = Address.newFromBech32(charityInput).toHex();
      await sendTxWithData(wallet, `setCharityAddress@${addrHex}`, 5_000_000n);
      showToast('Charity address updated', 'success');
      setCharityState('done');
      setCharityInput('');
      setTimeout(() => { setCharityState('idle'); fetchStats(); }, 3000);
    } catch (err) { showToast(err?.message ?? 'Transaction failed', 'error'); setCharityState('idle'); }
  };

  const handleSetToken = async () => {
    if (!tokenIdInput.includes('-')) { showToast('Invalid token ID', 'error'); return; }
    const denom = BigInt(denominationInput || '1');
    if (denom <= 0n) { showToast('Denomination must be > 0', 'error'); return; }
    setTokenState('pending');
    try {
      const tokenIdHex = toHex(tokenIdInput);
      const denomStr = denom.toString(16);
      const denomHex = denomStr.length % 2 === 0 ? denomStr : '0' + denomStr;
      await sendTxWithData(wallet, `setPixelToken@${tokenIdHex}@${denomHex}`, 5_000_000n);
      showToast('PIXEL token reconfigured', 'success');
      setTokenState('done');
      setTokenIdInput('');
      setDenominationInput('1');
      setTimeout(() => { setTokenState('idle'); fetchStats(); }, 3000);
    } catch (err) { showToast(err?.message ?? 'Transaction failed', 'error'); setTokenState('idle'); }
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
      const encodeListBytes = (names) => {
        let hex = '';
        for (const name of names) {
          const bytes = new TextEncoder().encode(name);
          hex += bytes.length.toString(16).padStart(8, '0');
          hex += Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        return hex;
      };
      const addrHexes = [];
      for (const r of validRows) {
        try { addrHexes.push(Address.newFromBech32(r.address.trim()).toHex()); }
        catch { showToast(`Invalid address: ${r.address.trim()}`, 'error'); setSetCharitiesState('idle'); return; }
      }
      await sendTxWithData(
        wallet,
        `setEpochCharities@${epochHex}@${encodeListBytes(validRows.map(r => r.name.trim()))}@${addrHexes.join('')}`,
        20_000_000n,
      );
      localStorage.setItem(`charity_meta_epoch_${epoch}`,  JSON.stringify(validRows.map(r => ({ photoUrl: r.photoUrl.trim(), link: r.link.trim() }))));
      localStorage.setItem(`charity_names_epoch_${epoch}`, JSON.stringify(validRows.map(r => r.name.trim())));
      showToast(`Charities set for epoch ${epoch}`, 'success');
      setSetCharitiesState('done');
      setTimeout(() => setSetCharitiesState('idle'), 3000);
    } catch (err) { showToast(err?.message ?? 'Transaction failed', 'error'); setSetCharitiesState('idle'); }
  };

  if (!isConnected) return null;

  const auctionClosed  = auctionInfo ? !auctionInfo.active : false;
  const hasActiveEpoch = (stats?.epoch ?? 0) > 0;
  const epochPhase     = !hasActiveEpoch ? 'idle' : auctionInfo?.active ? 'auction' : 'running';

  /* ════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: 'rgb(var(--bg))', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: '1px solid rgb(var(--border))',
        background: 'rgb(var(--surface))',
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(-1)}
            title="Go back"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid rgb(var(--border))', background: 'transparent', cursor: 'pointer', color: 'rgb(var(--text-secondary))', fontSize: 15, flexShrink: 0, transition: 'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgb(var(--bg-alt))'; e.currentTarget.style.color = 'rgb(var(--text))'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgb(var(--text-secondary))'; }}
          >
            ←
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'Fraunces, serif', letterSpacing: '-0.02em' }}>🎨 CanvasChain</span>
          <span style={{ color: 'rgb(var(--border-strong))', fontSize: 18, fontWeight: 300 }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'rgb(var(--text-secondary))' }}>Admin</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <EpochPhaseBadge phase={epochPhase} epoch={stats?.epoch} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 8, background: 'rgb(var(--bg-alt))', border: '1px solid rgb(var(--border))', fontSize: 11 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#48BB78', boxShadow: '0 0 0 2px rgba(72,187,120,0.25)' }} />
            <span style={{ fontFamily: 'monospace', color: 'rgb(var(--text-secondary))' }}>{wallet.address ? `${wallet.address.slice(0, 8)}…${wallet.address.slice(-4)}` : '—'}</span>
          </div>
          <button
            onClick={fetchStats}
            disabled={loadingStats}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid rgb(var(--border))', background: 'transparent', fontSize: 12, fontWeight: 500, color: 'rgb(var(--text-secondary))', cursor: loadingStats ? 'wait' : 'pointer', opacity: loadingStats ? 0.6 : 1 }}
          >
            <span style={{ display: 'inline-block', animation: loadingStats ? 'spin 1s linear infinite' : 'none' }}>↻</span>
            Refresh
          </button>
        </div>
      </header>

      {!isAdmin ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: 48, background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 16, maxWidth: 400 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Not authorized</h2>
            <p style={{ fontSize: 14, color: 'rgb(var(--text-muted))' }}>Only accessible to the contract owner wallet.</p>
            <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))', marginTop: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{wallet.address}</p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex' }}>

          {/* ── Sidebar ──────────────────────────────────────────────────── */}
          <aside style={{ width: 220, flexShrink: 0, borderRight: '1px solid rgb(var(--border))', background: 'rgb(var(--surface))', padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgb(var(--text-muted))', textTransform: 'uppercase', padding: '4px 12px', marginBottom: 4 }}>Navigation</p>
            {TABS.map(tab => (
              <SidebarTab key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}
                badge={tab.id === 'start' ? (!hasActiveEpoch ? '•' : null) : tab.id === 'end' ? (hasActiveEpoch ? '!' : null) : null}
              />
            ))}
            <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid rgb(var(--border))' }}>
              <p style={{ fontSize: 10, color: 'rgb(var(--text-muted))', marginBottom: 4, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Contract</p>
              <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgb(var(--text-muted))', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 10)}…${CONTRACT_ADDRESS.slice(-6)}` : '—'}
              </p>
            </div>
          </aside>

          {/* ── Main ─────────────────────────────────────────────────────── */}
          <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', maxHeight: 'calc(100vh - 56px)' }}>

            {activeTab === 'overview' && (
              <OverviewTab stats={stats} auctionInfo={auctionInfo} loading={loadingStats} />
            )}
            {activeTab === 'start' && (
              <StartEpochTab
                stats={stats}
                charityRows={charityRows} setCharityRows={setCharityRows}
                charityEpochInput={charityEpochInput} setCharityEpochInput={setCharityEpochInput}
                setCharitiesState={setCharitiesState} handleSetCharities={handleSetCharities}
                auctionSectionX={auctionSectionX} setAuctionSectionX={setAuctionSectionX}
                auctionSectionY={auctionSectionY} setAuctionSectionY={setAuctionSectionY}
                startAuctionState={startAuctionState} handleStartEpochWithAuction={handleStartEpochWithAuction}
              />
            )}
            {activeTab === 'end' && (
              <EndEpochTab
                stats={stats} auctionInfo={auctionInfo}
                closeAuctionState={closeAuctionState} handleCloseAuction={handleCloseAuction}
                endEpochState={endEpochState} endEpochStep={endEpochStep} lastNftUrl={lastNftUrl}
                handleEndEpoch={handleEndEpoch} hasActiveEpoch={hasActiveEpoch} auctionClosed={auctionClosed}
              />
            )}
            {activeTab === 'config' && (
              <ConfigTab
                stats={stats}
                nftCollectionInput={nftCollectionInput} setNftCollectionInput={setNftCollectionInput}
                setNftState={setNftState} handleSetNftCollection={handleSetNftCollection}
                epochDurationInput={epochDurationInput} setEpochDurationInput={setEpochDurationInput}
                epochDurationState={epochDurationState} handleSetEpochDuration={handleSetEpochDuration}
                auctionDurationInput={auctionDurationInput} setAuctionDurationInput={setAuctionDurationInput}
                auctionDurationState={auctionDurationState} handleSetAuctionDuration={handleSetAuctionDuration}
                charityInput={charityInput} setCharityInput={setCharityInput}
                charityState={charityState} handleSetCharity={handleSetCharity}
              />
            )}
            {activeTab === 'advanced' && (
              <AdvancedTab
                tokenIdInput={tokenIdInput} setTokenIdInput={setTokenIdInput}
                denominationInput={denominationInput} setDenominationInput={setDenominationInput}
                tokenState={tokenState} handleSetToken={handleSetToken}
              />
            )}

          </main>
        </div>
      )}

      <style>{`
        @keyframes spin       { to { transform: rotate(360deg); } }
        @keyframes pulse-dot  { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes fade-in    { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:none; } }
        .admin-fade { animation: fade-in 280ms ease both; }

        /* recharts tooltip */
        .admin-tooltip {
          background: rgb(var(--surface)) !important;
          border: 1px solid rgb(var(--border)) !important;
          border-radius: 8px !important;
          font-size: 12px !important;
          color: rgb(var(--text)) !important;
          padding: 8px 12px !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15) !important;
        }
      `}</style>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   Reusable primitives
   ════════════════════════════════════════════════════════════════════════════ */

const SidebarTab = ({ tab, active, onClick, badge }) => (
  <button onClick={onClick}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgb(var(--bg-alt))'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: active ? 'rgba(229,181,71,0.12)' : 'transparent', color: active ? 'rgb(var(--primary-dark))' : 'rgb(var(--text-secondary))', fontWeight: active ? 600 : 400, fontSize: 13.5, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 120ms' }}
  >
    <span style={{ fontSize: 14, opacity: active ? 1 : 0.7, width: 18, textAlign: 'center' }}>{tab.icon}</span>
    <span>{tab.label}</span>
    {badge && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: badge === '!' ? '#E53E3E' : '#48BB78', flexShrink: 0 }} />}
  </button>
);

const EpochPhaseBadge = ({ phase, epoch }) => {
  const cfg = {
    idle:    { label: 'No Active Epoch', color: '#9B978F', bg: 'rgba(155,151,143,0.12)', dot: false },
    auction: { label: `Epoch #${epoch} · Auction Live`, color: '#E5B547', bg: 'rgba(229,181,71,0.12)', dot: true },
    running: { label: `Epoch #${epoch} · Running`,      color: '#48BB78', bg: 'rgba(72,187,120,0.12)', dot: true },
  }[phase] ?? { label: '—', color: '#9B978F', bg: 'transparent', dot: false };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, background: cfg.bg, border: `1px solid ${cfg.color}40`, fontSize: 12, fontWeight: 500, color: cfg.color }}>
      {cfg.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, animation: 'pulse-dot 2s ease-in-out infinite', flexShrink: 0 }} />}
      {cfg.label}
    </div>
  );
};

const Spinner = ({ label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
    {label}
  </span>
);

const Field = ({ label, hint, children }) => (
  <div style={{ marginBottom: 18 }}>
    {label && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgb(var(--text-secondary))', marginBottom: 6, letterSpacing: '0.03em' }}>{label}</label>}
    {children}
    {hint && <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))', marginTop: 4, lineHeight: 1.5 }}>{hint}</p>}
  </div>
);

const Input = ({ mono, style: s, ...props }) => (
  <input {...props}
    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgb(var(--border))', background: 'rgb(var(--bg-alt))', color: 'rgb(var(--text))', fontSize: 13, fontFamily: mono ? 'monospace' : 'inherit', outline: 'none', transition: 'border-color 150ms', boxSizing: 'border-box', ...s }}
    onFocus={e => { e.currentTarget.style.borderColor = 'rgb(var(--primary))'; }}
    onBlur={e =>  { e.currentTarget.style.borderColor = 'rgb(var(--border))'; }}
  />
);

const PrimaryBtn = ({ disabled, pending, children, style: s, ...props }) => (
  <button disabled={disabled} {...props}
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 18px', borderRadius: 8, border: 'none', background: disabled ? 'rgb(var(--border))' : 'rgb(var(--primary))', color: disabled ? 'rgb(var(--text-muted))' : 'rgb(var(--text))', fontWeight: 600, fontSize: 13, cursor: disabled ? (pending ? 'wait' : 'not-allowed') : 'pointer', transition: 'all 150ms', whiteSpace: 'nowrap', flexShrink: 0, ...s }}
  >
    {children}
  </button>
);

const Card = ({ title, description, accent = 'rgb(var(--primary))', badge, children, style: s }) => (
  <div className="admin-fade" style={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 12, overflow: 'hidden', marginBottom: 16, ...s }}>
    <div style={{ borderBottom: '1px solid rgb(var(--border))', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 3, height: 20, borderRadius: 2, background: accent, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h3>
          {badge}
        </div>
        {description && <p style={{ fontSize: 12, color: 'rgb(var(--text-muted))', marginTop: 2 }}>{description}</p>}
      </div>
    </div>
    <div style={{ padding: '18px 22px' }}>{children}</div>
  </div>
);

const StepBadge = ({ n, done }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: done ? 'rgba(72,187,120,0.12)' : 'rgba(229,181,71,0.12)', color: done ? '#48BB78' : 'rgb(var(--primary-dark))', border: `1px solid ${done ? 'rgba(72,187,120,0.3)' : 'rgba(229,181,71,0.3)'}` }}>
    {done ? '✓' : `Step ${n}`}
  </span>
);

const ProgStep = ({ active, done, label }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: done ? '#48BB78' : active ? 'rgb(var(--primary))' : 'rgb(var(--text-muted))' }}>
    {done ? (
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(72,187,120,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#48BB78', flexShrink: 0 }}>✓</span>
    ) : active ? (
      <span style={{ width: 16, height: 16, border: '2px solid rgba(229,181,71,0.4)', borderTopColor: 'rgb(var(--primary))', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
    ) : (
      <span style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid rgb(var(--border))', flexShrink: 0 }} />
    )}
    {label}
  </span>
);

const PageTitle = ({ title, subtitle }) => (
  <div style={{ marginBottom: 24 }}>
    <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>{title}</h1>
    <p style={{ fontSize: 13, color: 'rgb(var(--text-muted))', margin: 0 }}>{subtitle}</p>
  </div>
);

const MetricCard = ({ icon, label, value, sub, accent, delta }) => (
  <div style={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 12, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent }} />
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      {delta !== undefined && (
        <span style={{ fontSize: 10, fontWeight: 700, color: delta >= 0 ? '#48BB78' : '#E53E3E', background: delta >= 0 ? 'rgba(72,187,120,0.12)' : 'rgba(229,62,62,0.12)', padding: '2px 7px', borderRadius: 10 }}>
          {delta >= 0 ? '+' : ''}{delta}
        </span>
      )}
    </div>
    <p style={{ fontSize: 11, fontWeight: 600, color: 'rgb(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</p>
    <p style={{ fontSize: 26, fontWeight: 700, fontFamily: 'Fraunces, serif', color: 'rgb(var(--text))', lineHeight: 1.2, marginBottom: 4 }}>{value}</p>
    {sub && <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))' }}>{sub}</p>}
  </div>
);

/* ── Custom recharts tooltip ─────────────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="admin-tooltip">
      {label && <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   TAB: Overview
   ════════════════════════════════════════════════════════════════════════════ */
const OverviewTab = ({ stats, auctionInfo, loading }) => {
  const now         = Date.now() / 1000;
  const epochStart  = stats?.startTimestamp ?? 0;
  const epochEnd    = epochStart > 0 ? epochStart + (stats?.durationSeconds ?? 0) : 0;
  const epochPct    = epochStart > 0 && epochEnd > epochStart ? Math.min(100, Math.round(((now - epochStart) / (epochEnd - epochStart)) * 100)) : 0;
  const timeLeft    = epochEnd > now ? epochEnd - now : 0;

  const painted  = stats?.serverStats?.totalPixels ?? 0;
  const total    = stats?.serverStats?.canvasSize ?? 10000;
  const fillPct  = total > 0 ? Math.round((painted / total) * 100) : 0;

  const donutData = [
    { name: 'Painted',  value: painted,        fill: '#E5B547' },
    { name: 'Blank',    value: total - painted, fill: 'rgb(var(--border))' },
  ];

  const fundData = [
    { name: 'Distributed', value: Number(stats?.totalDonated ?? 0n) / 1e18 },
    { name: 'Pending',     value: Number(stats?.egldPending  ?? 0n) / 1e18 },
  ];

  if (loading && !stats) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgb(var(--text-muted))', fontSize: 13, padding: '60px 0' }}>
      <span style={{ width: 16, height: 16, border: '2px solid rgb(var(--border))', borderTopColor: 'rgb(var(--primary))', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
      Loading contract data…
    </div>
  );

  if (!stats) return <div style={{ padding: '40px 0', color: 'rgb(var(--text-muted))', fontSize: 13 }}>No data — click Refresh to load.</div>;

  return (
    <div className="admin-fade">
      <PageTitle title="Overview" subtitle="Live snapshot of contract state and canvas health." />

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 28 }}>
        <MetricCard icon="🏛"  label="Current Epoch" value={stats.epoch > 0 ? `#${stats.epoch}` : '—'} sub={stats.endsAt ? `Ends ${stats.endsAt.toLocaleString()}` : 'Not started'} accent={stats.epoch > 0 ? '#48BB78' : '#9B978F'} />
        <MetricCard icon="🎨"  label="Canvas Fill"   value={`${fillPct}%`} sub={`${painted.toLocaleString()} / ${total.toLocaleString()} px`} accent="#E5B547" />
        <MetricCard icon="💰"  label="EGLD Donated"  value={`${(Number(stats.totalDonated) / 1e18).toFixed(4)}`} sub="EGLD total all epochs" accent="#9F7AEA" />
        <MetricCard icon="🔨"  label="Auction"       value={auctionInfo ? (auctionInfo.active ? 'Live' : 'Closed') : '—'} sub={auctionInfo ? `${(Number(auctionInfo.highestBid) / 1e18).toFixed(4)} EGLD top bid` : 'No auction'} accent={auctionInfo?.active ? '#E5B547' : '#9B978F'} />
        <MetricCard icon="👥"  label="Online Users"  value={stats.serverStats?.onlineUsers ?? '—'} sub="Connected right now" accent="#4299E1" />
        <MetricCard icon="🪙"  label="PIXEL Pending" value={stats.pixelForCharity.toLocaleString()} sub="PIXEL for charity pool" accent="#48BB78" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Canvas fill donut */}
        <Card title="Canvas Fill" description="Painted vs blank pixels across the 100×100 grid" accent="#E5B547">
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" strokeWidth={0}>
                  {donutData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div>
              <p style={{ fontSize: 36, fontWeight: 700, fontFamily: 'Fraunces, serif', lineHeight: 1, marginBottom: 6 }}>{fillPct}%</p>
              <p style={{ fontSize: 12, color: 'rgb(var(--text-muted))', marginBottom: 12 }}>of canvas painted</p>
              {donutData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: d.fill, flexShrink: 0, border: '1px solid rgb(var(--border))' }} />
                  <span style={{ fontSize: 12, color: 'rgb(var(--text-secondary))' }}>{d.name}: <strong>{d.value.toLocaleString()}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* EGLD funds */}
        <Card title="Charity Funds" description="Distributed vs pending EGLD for charity" accent="#9F7AEA">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={fundData} barSize={28} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgb(var(--text-secondary))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--text-muted))' }} axisLine={false} tickLine={false} tickFormatter={v => `${v.toFixed(2)}`} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" name="EGLD" radius={[4, 4, 0, 0]}>
                <Cell fill="#9F7AEA" />
                <Cell fill="#E5B547" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
            {fundData.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: i === 0 ? '#9F7AEA' : '#E5B547', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'rgb(var(--text-muted))' }}>{d.name}: <strong style={{ color: 'rgb(var(--text))' }}>{d.value.toFixed(4)} EGLD</strong></span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Epoch progress timeline */}
      {stats.epoch > 0 && stats.startTimestamp > 0 && (
        <Card title="Epoch Timeline" description={`Epoch #${stats.epoch} progress`} accent="#48BB78">
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgb(var(--text-muted))', marginBottom: 6 }}>
              <span>Started {new Date(stats.startTimestamp * 1000).toLocaleString()}</span>
              <span>{timeLeft > 0 ? `${fmtDuration(Math.round(timeLeft))} remaining` : 'Epoch ended'}</span>
            </div>
            <div style={{ height: 10, borderRadius: 99, background: 'rgb(var(--bg-alt))', border: '1px solid rgb(var(--border))', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${epochPct}%`, borderRadius: 99, background: `linear-gradient(90deg, #48BB78, #E5B547)`, transition: 'width 600ms ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgb(var(--text-muted))', marginTop: 4 }}>
              <span>0%</span>
              <span style={{ color: 'rgb(var(--text))', fontWeight: 600 }}>{epochPct}% elapsed</span>
              <span>100%</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
            {[
              { label: 'Epoch duration', value: fmtDuration(stats.durationSeconds) },
              { label: 'Auction duration', value: fmtDuration(stats.auctionDurationSeconds) },
              { label: 'Time left', value: timeLeft > 0 ? fmtDuration(Math.round(timeLeft)) : 'Ended' },
            ].map(r => (
              <div key={r.label} style={{ background: 'rgb(var(--bg-alt))', borderRadius: 8, padding: '10px 12px', border: '1px solid rgb(var(--border))' }}>
                <p style={{ fontSize: 10, color: 'rgb(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{r.label}</p>
                <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Fraunces, serif' }}>{r.value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Contract detail table */}
      <Card title="Contract Details" description="Full parameter snapshot" accent="rgb(var(--primary))">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 32px' }}>
          {[
            { label: 'Epoch duration',   value: stats.durationSeconds ? `${stats.durationSeconds}s · ${fmtDuration(stats.durationSeconds)}` : '—' },
            { label: 'Auction duration', value: stats.auctionDurationSeconds ? `${stats.auctionDurationSeconds}s · ${fmtDuration(stats.auctionDurationSeconds)}` : '—' },
            { label: 'PIXEL token',      value: stats.tokenId || '—',       mono: true },
            { label: 'Default charity',  value: stats.charityAddress ? `${stats.charityAddress.slice(0, 16)}…` : '—', mono: true },
            { label: 'Auction winner',   value: auctionInfo?.winner ? `${auctionInfo.winner.slice(0, 14)}…` : '—', mono: true },
            { label: 'EGLD pending',     value: `${(Number(stats.egldPending ?? 0n) / 1e18).toFixed(6)} EGLD` },
          ].map(row => (
            <div key={row.label}>
              <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 2 }}>{row.label}</p>
              <p style={{ fontSize: 13, fontFamily: row.mono ? 'monospace' : 'inherit', color: 'rgb(var(--text))' }}>{row.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   TAB: Start Epoch
   ════════════════════════════════════════════════════════════════════════════ */
const StartEpochTab = ({
  stats, charityRows, setCharityRows, charityEpochInput, setCharityEpochInput,
  setCharitiesState, handleSetCharities,
  auctionSectionX, setAuctionSectionX, auctionSectionY, setAuctionSectionY,
  startAuctionState, handleStartEpochWithAuction,
}) => {
  const readyCount = charityRows.filter(r => r.name.trim() && r.address.trim()).length;

  return (
    <div className="admin-fade">
      <PageTitle title="Start a New Epoch" subtitle="Complete both steps in order — charities first, then launch." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        <div>
          {/* Step 1 — Charities */}
          <Card title="Set Epoch Charities" description="Define charity candidates users will vote for this epoch." accent="#48BB78" badge={<StepBadge n={1} done={readyCount > 0} />}>
            <Field label="For epoch #">
              <Input type="number" value={charityEpochInput} onChange={e => setCharityEpochInput(e.target.value)} placeholder={stats?.epoch ? String(stats.epoch + 1) : '1'} min="1" style={{ width: 120 }} />
            </Field>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {charityRows.map((row, i) => {
                const complete = row.name.trim() && row.address.trim();
                return (
                  <div key={i} style={{ borderRadius: 10, border: `1px solid ${complete ? 'rgba(72,187,120,0.4)' : 'rgb(var(--border))'}`, background: complete ? 'rgba(72,187,120,0.04)' : 'rgb(var(--bg-alt))', padding: '12px 14px', transition: 'all 150ms' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: complete ? '#48BB78' : 'rgb(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{complete ? '✓ ' : ''}Charity {i + 1}</span>
                      {charityRows.length > 1 && <button onClick={() => setCharityRows(prev => prev.filter((_, j) => j !== i))} style={{ fontSize: 11, background: 'none', border: 'none', color: 'rgb(var(--text-muted))', cursor: 'pointer' }}>Remove</button>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
                      <Input type="text" value={row.name} onChange={e => setCharityRows(prev => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} placeholder="Name (e.g. UNICEF)" />
                      <Input type="text" value={row.address} onChange={e => setCharityRows(prev => prev.map((r, j) => j === i ? { ...r, address: e.target.value } : r))} placeholder="erd1… address" mono />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <Input type="url" value={row.photoUrl ?? ''} onChange={e => setCharityRows(prev => prev.map((r, j) => j === i ? { ...r, photoUrl: e.target.value } : r))} placeholder="Photo URL" />
                      <Input type="url" value={row.link ?? ''} onChange={e => setCharityRows(prev => prev.map((r, j) => j === i ? { ...r, link: e.target.value } : r))} placeholder="Website" />
                    </div>
                  </div>
                );
              })}
            </div>

            {charityRows.length < 5 && (
              <button onClick={() => setCharityRows(prev => [...prev, { name: '', address: '', photoUrl: '', link: '' }])}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#48BB78'; e.currentTarget.style.color = '#48BB78'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgb(var(--border))'; e.currentTarget.style.color = 'rgb(var(--text-muted))'; }}
                style={{ width: '100%', padding: 9, marginBottom: 14, borderRadius: 8, border: '1.5px dashed rgb(var(--border))', background: 'transparent', color: 'rgb(var(--text-muted))', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 150ms' }}
              >
                + Add another charity ({charityRows.length}/5)
              </button>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <PrimaryBtn disabled={setCharitiesState !== 'idle' || readyCount === 0} pending={setCharitiesState === 'pending'} onClick={handleSetCharities}>
                {setCharitiesState === 'pending' ? <Spinner label="Sending…" /> : setCharitiesState === 'done' ? '✓ Charities set' : `Set ${readyCount || ''} Charit${readyCount === 1 ? 'y' : 'ies'}`}
              </PrimaryBtn>
            </div>
          </Card>

          {/* Step 2 — Launch */}
          <Card title="Start Epoch with Auction" description={`Launch epoch ${(stats?.epoch ?? 0) + 1} + open a ${stats?.auctionDurationSeconds ? fmtDuration(stats.auctionDurationSeconds) : '5-min'} auction for the selected zone.`} accent="#E5B547" badge={<StepBadge n={2} done={false} />}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Field label="Auction zone X (0–80)">
                <Input type="number" value={auctionSectionX} onChange={e => setAuctionSectionX(e.target.value)} min="0" max="80" />
              </Field>
              <Field label="Auction zone Y (0–80)">
                <Input type="number" value={auctionSectionY} onChange={e => setAuctionSectionY(e.target.value)} min="0" max="80" />
              </Field>
            </div>
            <PrimaryBtn disabled={startAuctionState !== 'idle'} pending={startAuctionState === 'pending'} onClick={handleStartEpochWithAuction} style={{ width: '100%' }}>
              {startAuctionState === 'pending' ? <Spinner label="Sending…" /> : startAuctionState === 'done' ? '✓ Started' : `Launch Epoch ${(stats?.epoch ?? 0) + 1}`}
            </PrimaryBtn>
            <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))', marginTop: 6 }}>Zone: ({auctionSectionX}, {auctionSectionY}) → ({Number(auctionSectionX) + 19}, {Number(auctionSectionY) + 19})</p>
          </Card>
        </div>

        {/* Zone minimap sidebar */}
        <div>
          <Card title="Zone Preview" description="10×10 minimap (each cell = 10×10 px)" accent="rgb(var(--border-strong))">
            <ZoneMinimap x={parseInt(auctionSectionX, 10) || 0} y={parseInt(auctionSectionY, 10) || 0} />
          </Card>

          {/* Charity readiness */}
          <Card title="Charity Readiness" description="Status of entered charity rows" accent="#48BB78">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {charityRows.map((r, i) => {
                const ok = r.name.trim() && r.address.trim();
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'rgb(var(--bg-alt))', border: `1px solid ${ok ? 'rgba(72,187,120,0.3)' : 'rgb(var(--border))'}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? '#48BB78' : 'rgb(var(--border-strong))', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: ok ? 'rgb(var(--text))' : 'rgb(var(--text-muted))' }}>{r.name.trim() || `Charity ${i + 1}`}</span>
                    <span style={{ fontSize: 10, color: ok ? '#48BB78' : 'rgb(var(--text-muted))', flexShrink: 0 }}>{ok ? 'Ready' : 'Incomplete'}</span>
                  </div>
                );
              })}
              {readyCount > 0 && (
                <div style={{ marginTop: 4, padding: '6px 10px', borderRadius: 8, background: 'rgba(72,187,120,0.08)', border: '1px solid rgba(72,187,120,0.25)', fontSize: 11, color: '#48BB78', textAlign: 'center', fontWeight: 600 }}>
                  {readyCount} / {charityRows.length} ready to submit
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ── Zone minimap (10×10 CSS grid, each cell = 10×10 px) ─────────────────── */
const ZoneMinimap = ({ x, y }) => {
  /* Auction zone occupies 20×20 px → 2×2 cells in the 10×10 minimap */
  const zoneCol = Math.floor(x / 10);
  const zoneRow = Math.floor(y / 10);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2, aspectRatio: '1 / 1' }}>
        {Array.from({ length: 100 }, (_, idx) => {
          const col = idx % 10;
          const row = Math.floor(idx / 10);
          const inZone = (col === zoneCol || col === zoneCol + 1) && (row === zoneRow || row === zoneRow + 1);
          return (
            <div key={idx} style={{ aspectRatio: '1 / 1', borderRadius: 2, background: inZone ? 'rgba(229,181,71,0.7)' : 'rgb(var(--bg-alt))', border: `1px solid ${inZone ? 'rgba(229,181,71,0.9)' : 'rgb(var(--border))'}`, transition: 'background 200ms' }} />
          );
        })}
      </div>
      <p style={{ fontSize: 10, color: 'rgb(var(--text-muted))', marginTop: 8, textAlign: 'center' }}>
        <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'rgba(229,181,71,0.7)', verticalAlign: 'middle', marginRight: 4 }} />
        Auction zone at ({x}, {y})
      </p>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   TAB: End Epoch
   ════════════════════════════════════════════════════════════════════════════ */
const EndEpochTab = ({
  stats, auctionInfo,
  closeAuctionState, handleCloseAuction,
  endEpochState, endEpochStep, lastNftUrl, handleEndEpoch,
  hasActiveEpoch, auctionClosed,
}) => {
  const voteTallies      = stats?.voteTallies ?? [];
  const hasVotes         = voteTallies.some(v => v.votes > 0);
  const totalVotes       = voteTallies.reduce((s, v) => s + v.votes, 0);
  const highBidEgld      = Number(auctionInfo?.highestBid ?? 0n) / 1e18;
  const egldPendingEgld  = Number(stats?.egldPending ?? 0n) / 1e18;

  return (
    <div className="admin-fade">
      <PageTitle title="End the Current Epoch" subtitle="Run steps in order. Close the auction first, then end the epoch." />

      {/* Auto-distribution info banner */}
      <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'rgba(72,187,120,0.08)', border: '1px solid rgba(72,187,120,0.25)', marginBottom: 20, fontSize: 12, color: 'rgb(var(--text-secondary))', lineHeight: 1.6 }}>
        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>✅</span>
        <div>
          <strong style={{ color: 'rgb(var(--text))' }}>Distribution is automatic.</strong> When you call <em>End Epoch</em>, the contract automatically
          (1) sends all accumulated <strong>PIXEL tokens</strong> to the default charity address, and
          (2) sends all accumulated <strong>EGLD</strong> to the <em>vote-winning</em> charity. No separate distribute step needed.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div>
          {/* Step 1 — Close Auction */}
          <Card title="Close Auction" description="Finalises bidding — highest bidder gains zone paint rights, bid goes to charity pool." accent="#FC8181" badge={<StepBadge n={1} done={auctionClosed && hasActiveEpoch} />}>
            {auctionInfo ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgb(var(--bg-alt))', border: '1px solid rgb(var(--border))', marginBottom: 14 }}>
                {[
                  { label: 'Status', value: auctionInfo.active ? '🟡 Live' : '🟢 Closed', bold: true },
                  { label: 'Top Bid', value: `${highBidEgld.toFixed(4)} EGLD` },
                  { label: 'Winner', value: auctionInfo.winner ? `${auctionInfo.winner.slice(0, 10)}…` : '—', mono: true },
                ].map(r => (
                  <div key={r.label}>
                    <p style={{ fontSize: 10, color: 'rgb(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 3 }}>{r.label}</p>
                    <p style={{ fontSize: 13, fontWeight: r.bold ? 700 : 500, fontFamily: r.mono ? 'monospace' : 'inherit' }}>{r.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgb(var(--bg-alt))', border: '1px solid rgb(var(--border))', marginBottom: 14, fontSize: 12, color: 'rgb(var(--text-muted))' }}>No auction data — refresh first.</div>
            )}
            <PrimaryBtn disabled={closeAuctionState !== 'idle' || !auctionInfo?.active} pending={closeAuctionState === 'pending'} onClick={handleCloseAuction}>
              {closeAuctionState === 'pending' ? <Spinner label="Sending…" /> : closeAuctionState === 'done' ? '✓ Auction closed' : !auctionInfo?.active ? 'No active auction' : 'Close Auction'}
            </PrimaryBtn>
          </Card>

          {/* Step 2 — End Epoch */}
          <Card title="End Epoch & Distribute + Mint NFTs" description="Distributes PIXEL & EGLD to charities, mints 2 NFTs, resets canvas." accent="#E53E3E" badge={<StepBadge n={2} done={false} />}>
            {endEpochState === 'pending' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgb(var(--bg-alt))', border: '1px solid rgb(var(--border))', marginBottom: 14, fontSize: 12, flexWrap: 'wrap' }}>
                <ProgStep
                  active={endEpochStep === 'snapshotting'}
                  done={['uploading-painter', 'uploading-auction', 'signing'].includes(endEpochStep) || endEpochState === 'done'}
                  label="Snapshot"
                />
                <span style={{ color: 'rgb(var(--text-muted))' }}>→</span>
                <ProgStep
                  active={endEpochStep === 'uploading-painter'}
                  done={['uploading-auction', 'signing'].includes(endEpochStep) || endEpochState === 'done'}
                  label="Upload painter"
                />
                <span style={{ color: 'rgb(var(--text-muted))' }}>→</span>
                <ProgStep
                  active={endEpochStep === 'uploading-auction'}
                  done={endEpochStep === 'signing' || endEpochState === 'done'}
                  label="Upload zone"
                />
                <span style={{ color: 'rgb(var(--text-muted))' }}>→</span>
                <ProgStep active={endEpochStep === 'signing'} done={endEpochState === 'done'} label="Sign tx" />
                <span style={{ color: 'rgb(var(--text-muted))' }}>→</span>
                <ProgStep active={false} done={endEpochState === 'done'} label="Done" />
              </div>
            )}
            {lastNftUrl && endEpochState !== 'pending' && typeof lastNftUrl === 'object' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Painter NFT (full canvas)', url: lastNftUrl.painter },
                  { label: 'Auction NFT (20×20 zone)', url: lastNftUrl.auction },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgb(var(--bg-alt))', border: '1px solid rgb(var(--border))' }}>
                    <img src={item.url} alt={item.label} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', imageRendering: 'pixelated', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))', marginBottom: 2 }}>{item.label}</p>
                      <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgb(var(--primary-dark))', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{item.url}</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <PrimaryBtn disabled={endEpochState !== 'idle' || !hasActiveEpoch} pending={endEpochState === 'pending'} onClick={handleEndEpoch}>
                {endEpochState === 'pending' ? (
                  <Spinner label={
                    endEpochStep === 'snapshotting'      ? 'Saving snapshot…' :
                    endEpochStep === 'uploading-painter' ? 'Uploading canvas…' :
                    endEpochStep === 'uploading-auction' ? 'Uploading zone…' :
                    'Signing…'
                  } />
                ) : endEpochState === 'done' ? '✓ Epoch ended' : `End Epoch ${stats?.epoch ?? '—'}`}
              </PrimaryBtn>
              <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))' }}>Canvas resets ~30 s after confirmation.</p>
            </div>
          </Card>
        </div>

        {/* Right sidebar: charts */}
        <div>
          {/* Vote tally chart */}
          <Card title="Vote Tallies" description="Charity votes this epoch" accent="#4299E1">
            {voteTallies.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgb(var(--text-muted))', padding: '10px 0' }}>No vote data — refresh after charities are set.</p>
            ) : hasVotes ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={voteTallies} barSize={20} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgb(var(--text-secondary))' }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--text-muted))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="votes" name="Votes" fill="#4299E1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))', marginTop: 6 }}>{totalVotes} total votes cast</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {voteTallies.map((v, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 8px', borderRadius: 6, background: 'rgb(var(--bg-alt))' }}>
                    <span style={{ color: 'rgb(var(--text-secondary))' }}>{v.name}</span>
                    <span style={{ fontWeight: 600 }}>0 votes</span>
                  </div>
                ))}
                <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))', marginTop: 4 }}>No votes yet this epoch.</p>
              </div>
            )}
          </Card>

          {/* Pending funds summary */}
          <Card title="Pending Funds" description="Accumulated this epoch" accent="#E5B547">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'PIXEL for charity',   value: `${(stats?.pixelForCharity ?? 0n).toLocaleString()} PIXEL`,  bar: 60, color: '#E5B547' },
                { label: 'EGLD for charity',    value: `${egldPendingEgld.toFixed(6)} EGLD`,                        bar: Math.min(100, Math.round(egldPendingEgld * 200)), color: '#9F7AEA' },
                { label: 'Auction top bid',     value: `${highBidEgld.toFixed(4)} EGLD`,                            bar: Math.min(100, Math.round(highBidEgld * 300)), color: '#4299E1' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: 'rgb(var(--text-muted))' }}>{r.label}</span>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{r.value}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: 'rgb(var(--bg-alt))', border: '1px solid rgb(var(--border))' }}>
                    <div style={{ height: '100%', width: `${r.bar}%`, borderRadius: 99, background: r.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   TAB: Config
   ════════════════════════════════════════════════════════════════════════════ */
const ConfigTab = ({
  stats,
  nftCollectionInput, setNftCollectionInput, setNftState, handleSetNftCollection,
  epochDurationInput, setEpochDurationInput, epochDurationState, handleSetEpochDuration,
  auctionDurationInput, setAuctionDurationInput, auctionDurationState, handleSetAuctionDuration,
  charityInput, setCharityInput, charityState, handleSetCharity,
}) => {
  const epSecs      = stats?.durationSeconds ?? 0;
  const auctionSecs = stats?.auctionDurationSeconds ?? 0;
  const maxSecs     = Math.max(epSecs, 86400, 1);

  const durationData = [
    { name: 'Epoch',   value: epSecs,      fill: '#4299E1' },
    { name: 'Auction', value: auctionSecs, fill: '#E5B547' },
  ];

  return (
    <div className="admin-fade">
      <PageTitle title="Configuration" subtitle="One-time setup — usually only changed after deploy or before a demo." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        <div>
          <Card title="NFT Collection" description="ESDT collection for painter & auction-winner NFTs. Needs ESDTRoleNFTCreate." accent="#9F7AEA">
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Field label="Collection ID (e.g. PCANVAS-xxxxxx)" hint={stats?.tokenId ? `Current PIXEL token: ${stats.tokenId}` : undefined} >
                <Input type="text" value={nftCollectionInput} onChange={e => setNftCollectionInput(e.target.value)} placeholder="PCANVAS-xxxxxx" mono />
              </Field>
              <div style={{ paddingBottom: 18 }}>
                <PrimaryBtn disabled={setNftState !== 'idle' || !nftCollectionInput} pending={setNftState === 'pending'} onClick={handleSetNftCollection}>
                  {setNftState === 'pending' ? <Spinner label="Sending…" /> : setNftState === 'done' ? '✓ Set' : 'Set'}
                </PrimaryBtn>
              </div>
            </div>
          </Card>

          <Card title="Epoch Duration" description="How long each epoch lasts in seconds." accent="#4299E1">
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Field label="Duration (seconds)" hint={`Current: ${epSecs}s · ${fmtDuration(epSecs)}`}>
                <Input type="number" value={epochDurationInput} onChange={e => setEpochDurationInput(e.target.value)} placeholder="86400" min="1" />
              </Field>
              <div style={{ paddingBottom: 18 }}>
                <PrimaryBtn disabled={epochDurationState !== 'idle'} pending={epochDurationState === 'pending'} onClick={handleSetEpochDuration}>
                  {epochDurationState === 'pending' ? <Spinner label="Sending…" /> : epochDurationState === 'done' ? '✓ Set' : 'Set'}
                </PrimaryBtn>
              </div>
            </div>
          </Card>

          <Card title="Auction Duration" description="How long the auction stays open after an epoch starts." accent="#E5B547">
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Field label="Duration (seconds)" hint={`Current: ${auctionSecs}s · ${fmtDuration(auctionSecs)}`}>
                <Input type="number" value={auctionDurationInput} onChange={e => setAuctionDurationInput(e.target.value)} placeholder="300" min="1" />
              </Field>
              <div style={{ paddingBottom: 18 }}>
                <PrimaryBtn disabled={auctionDurationState !== 'idle'} pending={auctionDurationState === 'pending'} onClick={handleSetAuctionDuration}>
                  {auctionDurationState === 'pending' ? <Spinner label="Sending…" /> : auctionDurationState === 'done' ? '✓ Set' : 'Set'}
                </PrimaryBtn>
              </div>
            </div>
          </Card>

          <Card title="Default Charity Wallet" description="Fallback receiving EGLD if no epoch voting winner exists." accent="#4299E1">
            <div style={{ display: 'flex', gap: 8 }}>
              <Input type="text" value={charityInput} onChange={e => setCharityInput(e.target.value)} placeholder="erd1…" mono />
              <PrimaryBtn disabled={charityState !== 'idle' || !charityInput} pending={charityState === 'pending'} onClick={handleSetCharity}>
                {charityState === 'pending' ? <Spinner label="Sending…" /> : charityState === 'done' ? '✓ Done' : 'Update'}
              </PrimaryBtn>
            </div>
            {stats?.charityAddress && <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))', marginTop: 6, fontFamily: 'monospace' }}>Current: {stats.charityAddress.slice(0, 20)}…</p>}
          </Card>
        </div>

        {/* Duration chart sidebar */}
        <div>
          <Card title="Duration Comparison" description="Epoch vs Auction in seconds" accent="rgb(var(--border-strong))">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={durationData} layout="vertical" barSize={20} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'rgb(var(--text-muted))' }} axisLine={false} tickLine={false} domain={[0, maxSecs]} tickFormatter={v => fmtDuration(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'rgb(var(--text-secondary))' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} formatter={(v) => [`${v}s · ${fmtDuration(v)}`, 'Duration']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {durationData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Epoch',   val: epSecs,      color: '#4299E1', pct: Math.round((epSecs / maxSecs) * 100) },
                { label: 'Auction', val: auctionSecs, color: '#E5B547', pct: Math.round((auctionSecs / maxSecs) * 100) },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                      <span style={{ color: 'rgb(var(--text-secondary))' }}>{r.label}</span>
                    </span>
                    <span style={{ fontWeight: 600, color: 'rgb(var(--text))' }}>{fmtDuration(r.val)}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: 'rgb(var(--bg-alt))' }}>
                    <div style={{ height: '100%', width: `${r.pct}%`, borderRadius: 99, background: r.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick reference */}
          <Card title="Duration Reference" description="Common demo values" accent="rgb(var(--border-strong))">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                ['60s',    '1 min — quick test'],
                ['300s',   '5 min — demo'],
                ['3600s',  '1 hour — half-day demo'],
                ['86400s', '24h — production'],
              ].map(([s, d]) => (
                <div key={s} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '5px 8px', borderRadius: 6, background: 'rgb(var(--bg-alt))' }}>
                  <span style={{ fontFamily: 'monospace', color: 'rgb(var(--primary-dark))', fontWeight: 600 }}>{s}</span>
                  <span style={{ color: 'rgb(var(--text-muted))' }}>{d}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   TAB: Advanced
   ════════════════════════════════════════════════════════════════════════════ */
const AdvancedTab = ({ tokenIdInput, setTokenIdInput, denominationInput, setDenominationInput, tokenState, handleSetToken }) => (
  <div className="admin-fade">
    <PageTitle title="Advanced" subtitle="Rarely-needed operations. Use only if you know what you're doing." />
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(229,181,71,0.08)', border: '1px solid rgba(229,181,71,0.3)', marginBottom: 20, fontSize: 12, color: 'rgb(var(--text-secondary))' }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      Incorrect values here can break token purchase flows for all users. Double-check before submitting.
    </div>
    <Card title="Reconfigure PIXEL Token" description="Change the ESDT token identifier and denomination used for pixel purchases." accent="#718096">
      <Field label="Token ID (e.g. PIXEL-xxxxxx)">
        <Input type="text" value={tokenIdInput} onChange={e => setTokenIdInput(e.target.value)} placeholder="TOKEN-xxxxxx" mono />
      </Field>
      <Field label="Denomination" hint="Use 1 for 0-decimal tokens, 10^18 for 18-decimal tokens.">
        <div style={{ display: 'flex', gap: 8 }}>
          <Input type="number" value={denominationInput} onChange={e => setDenominationInput(e.target.value)} placeholder="1" min="1" />
          <PrimaryBtn disabled={tokenState !== 'idle' || !tokenIdInput} pending={tokenState === 'pending'} onClick={handleSetToken}>
            {tokenState === 'pending' ? <Spinner label="Sending…" /> : tokenState === 'done' ? '✓ Done' : 'Set Token'}
          </PrimaryBtn>
        </div>
      </Field>
    </Card>
  </div>
);

export default AdminPage;
