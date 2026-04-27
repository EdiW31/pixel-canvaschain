import { createContext, useContext, useState, useEffect } from 'react';

/**
 * AppContext - Global state management for Pixel CanvasChain
 *
 * Manages:
 * - Wallet connection state
 * - EGLD and credit balances
 * - Selected paint color
 * - Canvas grid state
 * - Toast notifications
 *
 * [FUTURE: This will integrate with @multiversx/sdk-dapp context providers]
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
  // Wallet State
  const [wallet, setWallet] = useState({
    address: null,
    isConnected: false,
    egld: 0,
    credits: 0,
  });

  // Canvas State
  const [gridState, setGridState] = useState(null); // 100x100 array
  const [selectedColor, setSelectedColor] = useState('#FF0000'); // Default red
  const [colorHistory, setColorHistory] = useState(['#FF0000']); // Recently used colors
  const [brushSize, setBrushSize] = useState(1); // Brush size: 1-4 (default 1x1)

  // Canvas View State (shared between Canvas and Toolbar)
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [minZoom, setMinZoom] = useState(1); // Minimum zoom (set on initial center)

  // UI State
  const [toast, setToast] = useState(null); // { message, type: 'success'|'error'|'info' }
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Connect wallet (mock implementation)
   * [FUTURE: Replace with real MultiversX wallet connection]
   */
  const connectWallet = (address, egld, credits, grid) => {
    setWallet({
      address,
      isConnected: true,
      egld,
      credits,
    });

    if (grid) {
      setGridState(grid);
    }

    showToast('Wallet connected successfully!', 'success');
  };

  /**
   * Disconnect wallet
   */
  const disconnectWallet = () => {
    setWallet({
      address: null,
      isConnected: false,
      egld: 0,
      credits: 0,
    });
    showToast('Wallet disconnected', 'info');
  };

  /**
   * Update balances after purchase or paint
   */
  const updateBalances = (egld, credits) => {
    setWallet((prev) => ({
      ...prev,
      egld: egld !== undefined ? egld : prev.egld,
      credits: credits !== undefined ? credits : prev.credits,
    }));
  };

  /**
   * Update EGLD balance
   */
  const updateEgld = (egld) => {
    setWallet((prev) => ({ ...prev, egld }));
  };

  /**
   * Update credit balance
   */
  const updateCredits = (credits) => {
    setWallet((prev) => ({ ...prev, credits }));
  };

  /**
   * Change selected paint color
   */
  const changeColor = (color) => {
    setSelectedColor(color);

    // Add to history (max 5 colors)
    setColorHistory((prev) => {
      const newHistory = [color, ...prev.filter((c) => c !== color)];
      return newHistory.slice(0, 5);
    });
  };

  /**
   * Update a single pixel in grid state
   */
  const updatePixel = (x, y, color) => {
    setGridState((prev) => {
      if (!prev) return prev;
      const newGrid = [...prev];
      newGrid[y] = [...newGrid[y]];
      newGrid[y][x] = color;
      return newGrid;
    });
  };

  /**
   * Show toast notification
   */
  const showToast = (message, type = 'info') => {
    setToast({ message, type });

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  /**
   * Dismiss toast manually
   */
  const dismissToast = () => {
    setToast(null);
  };

  // Load color from localStorage on mount
  useEffect(() => {
    const savedColor = localStorage.getItem('selectedColor');
    if (savedColor) {
      setSelectedColor(savedColor);
    }

    const savedHistory = localStorage.getItem('colorHistory');
    if (savedHistory) {
      try {
        setColorHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to load color history');
      }
    }
  }, []);

  // Save color to localStorage on change
  useEffect(() => {
    localStorage.setItem('selectedColor', selectedColor);
    localStorage.setItem('colorHistory', JSON.stringify(colorHistory));
  }, [selectedColor, colorHistory]);

  const value = {
    // Wallet
    wallet,
    connectWallet,
    disconnectWallet,
    updateBalances,
    updateEgld,
    updateCredits,

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

    // Canvas View (shared state)
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
