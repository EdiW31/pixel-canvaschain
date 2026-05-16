import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetIsLoggedIn } from '@multiversx/sdk-dapp/out/react/account/useGetIsLoggedIn';
import { usePixelBalance } from '../hooks/usePixelBalance';

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
  const epochRefetchRef = useRef(null);

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
    setEpochInfo({ epoch, startTimestamp, durationSeconds, endsAt });
  }, []);

  // Fetch epoch on mount and every 5 minutes
  useEffect(() => {
    fetchEpochInfo();
    epochRefetchRef.current = setInterval(fetchEpochInfo, 5 * 60 * 1000);
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
      // Convert bech32 address to hex for the arg
      try {
        const { Address } = await import('@multiversx/sdk-core');
        const addrHex = Address.fromBech32(voterAddress).toHex();
        const myVoteData = await queryContractRaw('getMyVote', [epochHex, addrHex]);
        if (myVoteData.length > 0) {
          const val = hexToU64(b64ToHex(myVoteData[0]));
          userVoteIndex = val;
          hasVoted = val !== 255;
        }
      } catch { /* ignore */ }
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
  }, [epochInfo.epoch, address, fetchVotingState]);

  // ── Pending pixels (painted but not yet paid for) ─────────────────────────
  // Map<"x_y", {x, y, color}> — keyed so repainting the same pixel replaces it.
  const [pendingPixels, setPendingPixels] = useState(new Map());
  const pendingCount = pendingPixels.size;

  const addPendingPixels = useCallback((pixels) => {
    setPendingPixels((prev) => {
      const next = new Map(prev);
      for (const p of pixels) {
        next.set(`${p.x}_${p.y}`, { x: p.x, y: p.y, color: p.color });
      }
      return next;
    });
  }, []);

  const clearPendingPixels = useCallback(() => {
    setPendingPixels(new Map());
  }, []);

  // Clear pending when wallet disconnects
  useEffect(() => {
    if (!isLoggedIn) clearPendingPixels();
  }, [isLoggedIn, clearPendingPixels]);

  // ── Canvas state ──────────────────────────────────────────────────────────
  const [gridState, setGridState] = useState(null);
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
    refetchEpochInfo: fetchEpochInfo,

    // Voting
    votingState,
    refetchVotingState: () => fetchVotingState(epochInfo.epoch, address || null),

    // Pending pixels (paint-then-pay)
    pendingPixels,
    pendingCount,
    addPendingPixels,
    clearPendingPixels,

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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
