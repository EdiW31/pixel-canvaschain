import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetIsLoggedIn } from '@multiversx/sdk-dapp/out/react/account/useGetIsLoggedIn';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { usePixelBalance } from '../hooks/usePixelBalance';

// Decode a 32-byte raw address blob (base64) to bech32. Returns '' for zero address.
function b64ToAddrBech32(b64) {
  if (!b64) return '';
  try {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    if (bytes.every(b => b === 0)) return '';
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return Address.newFromHex(hex).toBech32();
  } catch {
    return '';
  }
}

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const API_URL = import.meta.env.VITE_API_URL ?? 'https://devnet-api.multiversx.com';

async function queryContractU64(funcName) {
  try {
    const res = await fetch(`${API_URL}/vm-values/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scAddress: CONTRACT_ADDRESS, funcName, args: [] }),
    });
    const json = await res.json();
    const b64 = json.data?.data?.returnData?.[0];
    if (!b64) return 0;
    const hex = atob(b64).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    return hex ? parseInt(hex, 16) : 0;
  } catch {
    return 0;
  }
}

// Returns raw returnData array (base64 strings) from a contract query.
export async function queryContractRaw(funcName, args = []) {
  try {
    const res = await fetch(`${API_URL}/vm-values/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scAddress: CONTRACT_ADDRESS, funcName, args }),
    });
    const json = await res.json();
    return json.data?.data?.returnData ?? [];
  } catch {
    return [];
  }
}

function b64ToHex(b64) {
  return atob(b64).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

function decodeBigUintBase64(base64) {
  if (!base64) return BigInt(0);
  const s = atob(base64);
  let n = BigInt(0);
  for (let i = 0; i < s.length; i++) n = (n << BigInt(8)) | BigInt(s.charCodeAt(i));
  return n;
}
function b64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}
function hexToU64(hex) {
  return hex ? parseInt(hex, 16) : 0;
}
// Decode a MultiversX bech32 address from a 32-byte base64 blob.
// We keep it as hex here; bech32 conversion is done in the UI layer.
function b64ToAddrHex(b64) {
  return b64ToHex(b64);
}

const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

export const AppProvider = ({ children }) => {
  // ── Wallet (sdk-dapp) ─────────────────────────────────────────────────────
  const { address, account } = useGetAccountInfo();
  const isLoggedIn = useGetIsLoggedIn();
  const egld = parseFloat((Number(account?.balance ?? 0) / 1e18).toFixed(4));

  // ── PIXEL token balance ───────────────────────────────────────────────────
  const { pixelBalance, refetchPixelBalance } = usePixelBalance(address || null);

  const wallet = {
    address: address || null,
    isConnected: isLoggedIn,
    egld,
    pixelBalance,
  };

  // ── Epoch info ────────────────────────────────────────────────────────────
  const [epochInfo, setEpochInfo] = useState({ epoch: 0, startTimestamp: 0, durationSeconds: 0, endsAt: 0 });
  // Derived: true whenever painting is NOT allowed (no epoch yet, contract
  // says ended, natural duration expired, or contract is in "ended sentinel"
  // state — `durationSeconds === 1`, set by endEpoch).
  // Kept as a separate state slot so consumers (useCanvas, Canvas overlay)
  // can subscribe to lock-state changes without re-rendering on every
  // epochInfo poll.
  const [paintLocked, setPaintLocked] = useState(true);
  const epochRefetchRef = useRef(null);

  // ── Auction state ─────────────────────────────────────────────────────────
  const [auctionState, setAuctionState] = useState(null);
  const auctionRefetchRef = useRef(null);

  // ── NFT collection ID (one-time fetch) ───────────────────────────────────
  const [nftCollectionId, setNftCollectionId] = useState(null);

  // ── Voting state ──────────────────────────────────────────────────────────
  // charities: [{ name, address, votes }]
  const [votingState, setVotingState] = useState({ charities: [], hasVoted: false, userVoteIndex: 255, loading: false });
  const votingRefetchRef = useRef(null);

  const fetchEpochInfo = useCallback(async () => {
    const [epoch, startTimestamp, durationSeconds] = await Promise.all([
      queryContractU64('getCurrentEpoch'),
      queryContractU64('getEpochStartTimestamp'),
      queryContractU64('getEpochDuration'),
    ]);
    const endsAt = startTimestamp > 0 && durationSeconds > 0
      ? (startTimestamp + durationSeconds) * 1000  // convert to ms
      : 0;
    // Authoritative end signal — the contract sets `epoch_ended[epoch] = true`
    // inside endEpoch. Timer-based detection alone is unreliable because
    // endEpoch can fire before the natural end OR the admin might bump
    // setEpochDuration mid-epoch.
    let ended = false;
    if (epoch > 0) {
      try {
        const epochHex = epoch.toString(16).padStart(2, '0');
        const raw = await queryContractRaw('isEpochEnded', [epochHex]);
        // Contract returns `true` as a single non-zero byte; missing/empty = false.
        ended = !!(raw && raw[0] && atob(raw[0]).charCodeAt(0) === 1);
      } catch { /* view may not exist on older contract — treat as not-ended */ }
    }
    setEpochInfo({ epoch, startTimestamp, durationSeconds, endsAt, ended });

    // Paint lock derivation — single source of truth for "can the user
    // paint right now?". Matches EpochBanner's end-detection (line 70).
    // Locked when:
    //   - no epoch has ever started (epoch === 0), OR
    //   - contract flagged this epoch as ended (admin called endEpoch), OR
    //   - the natural duration ran out and admin hasn't restarted yet, OR
    //   - durationSeconds === 1 (sentinel value endEpoch writes to mark
    //     "ended, awaiting startEpochWithAuction")
    const naturalExpired =
      startTimestamp > 0 &&
      durationSeconds > 1 &&
      (startTimestamp + durationSeconds) * 1000 <= Date.now();
    setPaintLocked(!epoch || ended || naturalExpired || durationSeconds === 1);
  }, []);

  // Fetch epoch on mount and every 30 s — tight enough that an admin's
  // endEpoch in another tab is reflected in users' canvases within ~30 s.
  useEffect(() => {
    fetchEpochInfo();
    epochRefetchRef.current = setInterval(fetchEpochInfo, 30_000);
    return () => clearInterval(epochRefetchRef.current);
  }, [fetchEpochInfo]);

  const fetchVotingState = useCallback(async (epoch, voterAddress) => {
    if (!epoch) { setVotingState({ charities: [], hasVoted: false, userVoteIndex: 255, loading: false }); return; }
    setVotingState(prev => ({ ...prev, loading: true }));

    const epochHex = epoch.toString(16).padStart(2, '0');

    // Fetch charities + vote counts
    const [charitiesData, countsData] = await Promise.all([
      queryContractRaw('getEpochCharities', [epochHex]),
      queryContractRaw('getVoteTallies', [epochHex]),
    ]);

    // getEpochCharities returns MultiValue2<ManagedVec<ManagedBuffer>, ManagedVec<ManagedAddress>>.
    // Each ManagedVec is nested-encoded into a SINGLE returnData blob, items concatenated:
    //   charitiesData[0] = (4-byte len + utf8 bytes) * N
    //   charitiesData[1] = (32 raw bytes) * N
    const decodeNestedBytes = (b64) => {
      if (!b64) return [];
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const result = [];
      let off = 0;
      while (off + 4 <= bytes.length) {
        const len = view.getUint32(off);
        off += 4;
        if (off + len > bytes.length) break;
        result.push(new TextDecoder().decode(bytes.slice(off, off + len)));
        off += len;
      }
      return result;
    };
    const decodeNestedAddrs = (b64) => {
      if (!b64) return [];
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const result = [];
      for (let off = 0; off + 32 <= bytes.length; off += 32) {
        result.push(Array.from(bytes.slice(off, off + 32))
          .map(b => b.toString(16).padStart(2, '0')).join(''));
      }
      return result;
    };
    const decodeNestedU64 = (b64) => {
      if (!b64) return [];
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const result = [];
      for (let off = 0; off + 8 <= bytes.length; off += 8) {
        const hi = view.getUint32(off);
        const lo = view.getUint32(off + 4);
        result.push(hi * 0x100000000 + lo);
      }
      return result;
    };

    const names = decodeNestedBytes(charitiesData[0]);
    const addrs = decodeNestedAddrs(charitiesData[1]);
    const votes = decodeNestedU64(countsData[0]);

    const charities = names.map((name, i) => ({
      name,
      addressHex: addrs[i] || '',
      votes: votes[i] ?? 0,
    }));

    // Fetch user vote if connected
    let hasVoted = false;
    let userVoteIndex = 255;
    if (voterAddress) {
      try {
        const addrHex = Address.newFromBech32(voterAddress).toHex();
        const myVoteData = await queryContractRaw('getMyVote', [epochHex, addrHex]);
        if (myVoteData.length > 0) {
          const hex = b64ToHex(myVoteData[0]);
          // Empty bytes encode u32=0 (top-level minimum-bytes encoding).
          const val = hex === '' ? 0 : parseInt(hex, 16);
          userVoteIndex = val;
          hasVoted = val !== 255;
        }
      } catch (err) {
        console.warn('[voting] getMyVote query failed:', err);
      }
    }

    setVotingState({ charities, hasVoted, userVoteIndex, loading: false });
  }, []);

  // Refresh voting state when epoch or wallet changes; also poll every 30s
  useEffect(() => {
    fetchVotingState(epochInfo.epoch, address || null);
    clearInterval(votingRefetchRef.current);
    votingRefetchRef.current = setInterval(
      () => fetchVotingState(epochInfo.epoch, address || null),
      30_000,
    );
    return () => clearInterval(votingRefetchRef.current);
  }, [epochInfo.epoch, address, isLoggedIn, fetchVotingState]);

  const fetchAuctionState = useCallback(async (epoch, callerAddress) => {
    if (!epoch) { setAuctionState(null); return; }
    const epochHex = epoch.toString(16).padStart(2, '0');

    const stateData = await queryContractRaw('getAuctionState', [epochHex]);
    // getAuctionState returns MultiValue7<bool, u32, u32, u64, ManagedAddress, BigUint, ManagedAddress>
    // Each item is a separate returnData entry.
    if (!stateData || stateData.length < 7) { setAuctionState(null); return; }

    const active = stateData[0] ? atob(stateData[0]).charCodeAt(0) === 1 : false;
    const sectionX = stateData[1] ? parseInt(b64ToHex(stateData[1]) || '0', 16) : 0;
    const sectionY = stateData[2] ? parseInt(b64ToHex(stateData[2]) || '0', 16) : 0;
    const endTsHex = b64ToHex(stateData[3]);
    const endTs = endTsHex ? parseInt(endTsHex, 16) : 0;
    const highestBidder = b64ToAddrBech32(stateData[4]);
    const highestBid = decodeBigUintBase64(stateData[5]);
    const winner = b64ToAddrBech32(stateData[6]);

    let myBid = BigInt(0);
    if (callerAddress) {
      try {
        const addrHex = Address.newFromBech32(callerAddress).toHex();
        const myBidData = await queryContractRaw('getMyBid', [epochHex, addrHex]);
        myBid = decodeBigUintBase64(myBidData[0] ?? '');
      } catch (_) {}
    }

    setAuctionState({
      epoch,
      active,
      sectionX,
      sectionY,
      endTs,
      highestBidder,
      highestBid,
      winner,
      myBid,
      hasWon: winner !== '' && callerAddress === winner,
    });
  }, []);

  // Poll auction state every 15s while connected
  useEffect(() => {
    fetchAuctionState(epochInfo.epoch, address || null);
    clearInterval(auctionRefetchRef.current);
    auctionRefetchRef.current = setInterval(
      () => fetchAuctionState(epochInfo.epoch, address || null),
      15_000,
    );
    return () => clearInterval(auctionRefetchRef.current);
  }, [epochInfo.epoch, address, isLoggedIn, fetchAuctionState]);

  // Fetch NFT collection ID once on mount
  useEffect(() => {
    queryContractRaw('getNftCollectionId', []).then(data => {
      if (data && data[0]) {
        try { setNftCollectionId(atob(data[0])); } catch (_) {}
      }
    });
  }, []);

  // ── Pending pixels (painted but not yet paid for) ─────────────────────────
  // Map<"x_y", {x, y, color}> — keyed so repainting the same pixel replaces it.
  const [pendingPixels, setPendingPixels] = useState(new Map());
  const pendingCount = pendingPixels.size;

  // Ref to track the original grid color BEFORE each pixel was first painted into
  // pending. Used by undoPendingPixels() to restore the canvas on undo.
  const pendingOriginalsRef = useRef(new Map()); // Map<"x_y", originalColor>

  // Keep a live ref to gridState so addPendingPixels can snapshot originals
  // without needing gridState in its dependency array.
  // NOTE: the syncing useEffect is placed AFTER gridState is declared below.
  const gridStateRef = useRef(null);

  const addPendingPixels = useCallback((pixels) => {
    setPendingPixels((prev) => {
      const next = new Map(prev);
      for (const p of pixels) {
        const key = `${p.x}_${p.y}`;
        // Capture original color the first time this pixel enters pending
        if (!prev.has(key) && !pendingOriginalsRef.current.has(key)) {
          const origColor = gridStateRef.current?.[p.y]?.[p.x] ?? '#FFFFFF';
          pendingOriginalsRef.current.set(key, origColor);
        }
        next.set(key, { x: p.x, y: p.y, color: p.color });
      }
      return next;
    });
  }, []);

  const clearPendingPixels = useCallback(() => {
    setPendingPixels(new Map());
    pendingOriginalsRef.current = new Map();
  }, []);

  /**
   * Undo all pending pixels: reverts the local gridState to the original
   * colors and clears the pending set.
   * Returns an array of {x, y, color} with the original colors so the caller
   * can emit pixels:paint to the server.
   */
  const undoPendingPixels = useCallback(() => {
    const reverts = [];
    pendingOriginalsRef.current.forEach((origColor, key) => {
      const [x, y] = key.split('_').map(Number);
      reverts.push({ x, y, color: origColor });
    });
    // Revert local grid visually
    reverts.forEach(({ x, y, color }) => {
      setGridState((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[y] = [...next[y]];
        next[y][x] = color;
        return next;
      });
    });
    clearPendingPixels();
    return reverts;
  }, [clearPendingPixels]);

  // Clear pending when wallet disconnects
  useEffect(() => {
    if (!isLoggedIn) clearPendingPixels();
  }, [isLoggedIn, clearPendingPixels]);

  // ── Canvas state ──────────────────────────────────────────────────────────
  const [gridState, setGridState] = useState(null);
  // Keep gridStateRef in sync — must live AFTER gridState declaration to avoid TDZ
  useEffect(() => { gridStateRef.current = gridState; }, [gridState]);

  const [selectedColor, setSelectedColor] = useState('#FF0000');
  const [colorHistory, setColorHistory] = useState(['#FF0000']);
  const [brushSize, setBrushSize] = useState(1);

  // ── Canvas view state ─────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [minZoom, setMinZoom] = useState(1);

  // ── Reference image overlay ───────────────────────────────────────────────
  const [refImageSrc, setRefImageSrc] = useState(null);
  const [refImageOpacity, setRefImageOpacity] = useState(0.7);
  const [refImageRect, setRefImageRect] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [refImageLocked, setRefImageLocked] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Total donated (polled every 60s) ──────────────────────────────────────
  const [totalDonatedEgld, setTotalDonatedEgld] = useState(null);

  useEffect(() => {
    const fetchDonated = async () => {
      const returnData = await queryContractRaw('getTotalDonated', []);
      const wei = decodeBigUintBase64(returnData[0] ?? '');
      setTotalDonatedEgld(Number(wei) / 1e18);
    };
    fetchDonated();
    const id = setInterval(fetchDonated, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Color helpers ─────────────────────────────────────────────────────────
  const changeColor = (color) => {
    setSelectedColor(color);
    setColorHistory((prev) => {
      const newHistory = [color, ...prev.filter((c) => c !== color)];
      return newHistory.slice(0, 5);
    });
  };

  // ── Pixel helper ──────────────────────────────────────────────────────────
  const updatePixel = (x, y, color) => {
    setGridState((prev) => {
      if (!prev) return prev;
      const newGrid = [...prev];
      newGrid[y] = [...newGrid[y]];
      newGrid[y][x] = color;
      return newGrid;
    });
  };

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const dismissToast = () => setToast(null);

  // ── Persist color to localStorage ────────────────────────────────────────
  useEffect(() => {
    const savedColor = localStorage.getItem('selectedColor');
    if (savedColor) setSelectedColor(savedColor);
    const savedHistory = localStorage.getItem('colorHistory');
    if (savedHistory) {
      try { setColorHistory(JSON.parse(savedHistory)); } catch (_) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('selectedColor', selectedColor);
    localStorage.setItem('colorHistory', JSON.stringify(colorHistory));
  }, [selectedColor, colorHistory]);

  const value = {
    // Wallet
    wallet,
    refetchPixelBalance,

    // Epoch
    epochInfo,
    paintLocked,
    refetchEpochInfo: fetchEpochInfo,

    // Voting
    votingState,
    refetchVotingState: () => fetchVotingState(epochInfo.epoch, address || null),

    // Pending pixels (paint-then-pay)
    pendingPixels,
    pendingCount,
    addPendingPixels,
    clearPendingPixels,
    undoPendingPixels,

    // Canvas
    gridState,
    setGridState,
    updatePixel,

    // Color
    selectedColor,
    changeColor,
    colorHistory,

    // Brush
    brushSize,
    setBrushSize,

    // Canvas view
    zoom,
    setZoom,
    offset,
    setOffset,
    minZoom,
    setMinZoom,

    // Reference image overlay
    refImageSrc,
    setRefImageSrc,
    refImageOpacity,
    setRefImageOpacity,
    refImageRect,
    setRefImageRect,
    refImageLocked,
    setRefImageLocked,

    // UI
    toast,
    showToast,
    dismissToast,
    isLoading,
    setIsLoading,

    // On-chain aggregates
    totalDonatedEgld,

    // Phase 3: Auction
    auctionState,
    refetchAuctionState: () => fetchAuctionState(epochInfo.epoch, address || null),
    nftCollectionId,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
