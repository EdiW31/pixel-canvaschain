import { useEffect, useState, createContext, useContext } from 'react';
import { io } from 'socket.io-client';
import { useApp } from '../context/AppContext';
import { useGetIsLoggedIn } from '@multiversx/sdk-dapp/out/react/account/useGetIsLoggedIn';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';

const SocketContext = createContext();

/**
 * Pull a human-readable revert reason out of a devnet transaction payload.
 * MultiversX surfaces SC errors either in `logs.events` (topic/data) or in the
 * `smartContractResults[].returnMessage`. Returns null if nothing useful found.
 */
function extractRevertReason(data) {
  try {
    const scr = data?.smartContractResults;
    if (Array.isArray(scr)) {
      for (const r of scr) {
        if (r?.returnMessage) return r.returnMessage;
      }
    }
    const events = data?.logs?.events;
    if (Array.isArray(events)) {
      for (const ev of events) {
        if (ev?.identifier === 'signalError' || ev?.identifier === 'internalVMErrors') {
          // `data` is base64-encoded; the message is usually plain-text inside.
          const raw = ev?.data ? atob(ev.data) : '';
          const m = raw.match(/\[([^\]]+)\]/g);
          if (m && m.length) return m[m.length - 1].replace(/[[\]]/g, '');
          if (raw) return raw.slice(0, 120);
        }
      }
    }
  } catch (_) { /* best-effort only */ }
  return null;
}

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [liveStats, setLiveStats] = useState(null);

  const { updatePixel, showToast, setGridState, addPendingPixels, clearPendingPixels, refetchPixelBalance } = useApp();
  const isLoggedIn = useGetIsLoggedIn();
  const { address } = useGetAccountInfo();

  // 1. Create socket once on mount
  useEffect(() => {
    const socketInstance = io('http://localhost:5001', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketInstance.on('connect', () => {
      console.log('✅ Socket connected:', socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      setIsConnected(false);
    });

    // Canvas events
    socketInstance.on('pixel:update', ({ x, y, color }) => {
      updatePixel(x, y, color);
    });

    socketInstance.on('pixels:update', ({ pixels }) => {
      pixels.forEach(({ x, y, color }) => updatePixel(x, y, color));
    });

    socketInstance.on('canvas:init', ({ gridState }) => {
      setGridState(gridState);
      console.log('🖼️  Canvas initialized from server');
    });

    // wallet:joined — server confirmed session, load grid
    socketInstance.on('wallet:joined', ({ gridState }) => {
      setGridState(gridState);
    });

    // pixels:committed — server acknowledged PIXEL tx, clear pending.
    // Also kick the PIXEL balance fetcher so the displayed balance drops
    // immediately instead of waiting up to 20s for the next poll tick.
    // Retry after 8s to catch devnet API once the tx is reflected on-chain.
    socketInstance.on('pixels:committed', () => {
      clearPendingPixels();
      try { refetchPixelBalance?.(); } catch (_) {}
      setTimeout(() => { try { refetchPixelBalance?.(); } catch (_) {} }, 8_000);
    });

    socketInstance.on('error', ({ message }) => {
      console.error('Socket error:', message);
      showToast(message, 'error');
    });

    socketInstance.on('stats:data', (data) => {
      setLiveStats(data);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Emit wallet:join whenever socket connects and user is logged in
  useEffect(() => {
    if (socket && isConnected && isLoggedIn && address) {
      console.log('📡 Emitting wallet:join for', address.slice(0, 10), '...');
      socket.emit('wallet:join', { address });
    }
  }, [socket, isConnected, isLoggedIn, address]);

  /**
   * Paint a single pixel — updates canvas visually AND adds to pending.
   */
  const paintPixel = (x, y, color) => {
    if (!socket || !isConnected) {
      showToast('Not connected to server', 'error');
      return false;
    }
    socket.emit('pixel:paint', { x, y, color });
    addPendingPixels([{ x, y, color }]);
    return true;
  };

  /**
   * Paint multiple pixels (brush mode) — updates canvas AND adds to pending.
   */
  const paintPixels = (pixels) => {
    if (!socket || !isConnected) {
      showToast('Not connected to server', 'error');
      return false;
    }
    if (!Array.isArray(pixels) || pixels.length === 0) return false;
    socket.emit('pixels:paint', { pixels });
    addPendingPixels(pixels);
    return true;
  };

  /**
   * Notify server that a paintPixels ESDT tx was confirmed on-chain.
   */
  const notifyPixelsSubmitted = (txHash, pixels) => {
    if (socket && isConnected) {
      // Forward the pixel list so the server can register the tx with its
      // own poller (resilient to the user closing the tab before
      // watchPaintTx resolves).
      socket.emit('pixels:submit', { txHash, pixels });
    }
  };

  /**
   * Poll the devnet API for a paintPixels tx's outcome.
   *
   * Pixels are already persisted server-side at paint time (socket paint →
   * SQLite), so this watcher does NOT remove pixels on failure — it only
   * surfaces the on-chain result to the user and refreshes the token balance
   * once the payment actually settles.
   *
   * Returns a promise that resolves to 'success' | 'failed' | 'timeout'.
   */
  const watchPaintTx = async (txHash, pixels) => {
    if (!txHash || !Array.isArray(pixels) || pixels.length === 0) return 'timeout';
    const TX_OK = ['success', 'successful', 'executed'];
    const TX_BAD = ['fail', 'failed', 'invalid', 'rejected'];
    const apiBase = import.meta.env.VITE_DEVNET_API_URL ?? 'https://devnet-api.multiversx.com';
    const deadline = Date.now() + 90_000; // 90s
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3_000));
      try {
        const res = await fetch(`${apiBase}/transactions/${txHash}`);
        if (!res.ok) continue;
        const data = await res.json();
        const status = data?.status;
        if (TX_OK.includes(status)) {
          // Belt-and-suspenders: pixels were already saved at paint time, but
          // re-confirm so the server's pending-tx watcher can clear itself.
          if (socket && isConnected) {
            socket.emit('pixels:confirm', { pixels, txHash });
          }
          // Tokens have left the wallet for real — refresh balance now.
          try { refetchPixelBalance?.(); } catch (_) {}
          return 'success';
        }
        if (TX_BAD.includes(status)) {
          // Surface the on-chain revert reason if the API exposes one.
          const reason = extractRevertReason(data);
          showToast(
            reason
              ? `Payment failed on-chain: ${reason}`
              : 'Payment failed on-chain. Pixels stay on the canvas but were not paid for.',
            'error',
          );
          return 'failed';
        }
        // 'pending' / unknown → keep polling
      } catch (err) {
        // network blip; keep trying
        console.warn('[watchPaintTx]', err?.message);
      }
    }
    // Timed out waiting for devnet — pixels remain saved; just inform the user.
    showToast('Payment not confirmed yet — pixels saved, balance may update shortly.', 'error');
    return 'timeout';
  };

  const requestCanvas = () => {
    if (socket && isConnected) socket.emit('canvas:request');
  };

  const requestStats = () => {
    if (socket && isConnected) socket.emit('stats:request');
  };

  const value = {
    socket,
    isConnected,
    paintPixel,
    paintPixels,
    notifyPixelsSubmitted,
    watchPaintTx,
    requestCanvas,
    requestStats,
    liveStats,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
