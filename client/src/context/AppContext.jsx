import { createContext, useContext, useState, useEffect } from 'react';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetIsLoggedIn } from '@multiversx/sdk-dapp/out/react/account/useGetIsLoggedIn';
import { useContractCredits } from '../hooks/useContractCredits';

/**
 * AppContext — Global state management for Pixel CanvasChain
 *
 * Phase 2: wallet address/egld/isConnected come from @multiversx/sdk-dapp.
 * Credits are fetched from the smart contract via useContractCredits.
 * Canvas, color, toast, and zoom state remain local.
 */

const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  // ── Real wallet state from sdk-dapp ───────────────────────────────────────
  const { address, account } = useGetAccountInfo();
  const isLoggedIn = useGetIsLoggedIn();

  // Balance: string in smallest EGLD units → convert to float
  const egld = parseFloat((Number(account?.balance ?? 0) / 1e18).toFixed(4));

  // ── On-chain credits from smart contract ──────────────────────────────────
  const { credits, refetchCredits } = useContractCredits(address || null);

  // Derived wallet object (same shape as Phase 1 so other components need no changes)
  const wallet = {
    address: address || null,
    isConnected: isLoggedIn,
    egld,
    credits,
  };

  // ── Canvas state ──────────────────────────────────────────────────────────
  const [gridState, setGridState] = useState(null);
  const [selectedColor, setSelectedColor] = useState('#FF0000');
  const [colorHistory, setColorHistory] = useState(['#FF0000']);
  const [brushSize, setBrushSize] = useState(1);

  // ── Canvas view state ─────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [minZoom, setMinZoom] = useState(1);

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
    setTimeout(() => setToast(null), 3000);
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
    // Wallet (real, from sdk-dapp + contract)
    wallet,
    refetchCredits,

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

    // UI
    toast,
    showToast,
    dismissToast,
    isLoading,
    setIsLoading,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
