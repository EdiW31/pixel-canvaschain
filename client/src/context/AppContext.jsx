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
