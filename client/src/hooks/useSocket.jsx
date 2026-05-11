import { useEffect, useState, createContext, useContext } from 'react';
import { io } from 'socket.io-client';
import { useApp } from '../context/AppContext';
import { useGetIsLoggedIn } from '@multiversx/sdk-dapp/out/react/account/useGetIsLoggedIn';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';

/**
 * Socket Context for providing socket instance throughout the app.
 */
const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

/**
 * SocketProvider — Manages Socket.io connection lifecycle (Phase 2)
 *
 * After the socket connects, it waits for the user to be logged in via
 * sdk-dapp, then emits wallet:join so the server can seed session credits
 * from the on-chain balance.
 *
 * Credits displayed in the UI come from useContractCredits (chain polling).
 * The server's credits:updated event is ignored — the polling handles updates.
 */
export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const { updatePixel, showToast, setGridState, refetchCredits } = useApp();
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

    // wallet:joined — server confirmed session, canvas state included
    socketInstance.on('wallet:joined', ({ address: addr, credits, gridState }) => {
      console.log(`💼 Session started: ${addr?.slice(0, 10)}... | ${credits} session credits`);
      setGridState(gridState);
      // Trigger a fresh chain poll so the UI shows on-chain balance immediately
      refetchCredits();
    });

    // credits:updated — session-local count after each paint; trigger chain poll
    socketInstance.on('credits:updated', () => {
      // Don't update local state with the server's session count —
      // useContractCredits polls the real on-chain balance every 15s.
      // Uncomment below if you want an immediate refetch after every pixel:
      // refetchCredits();
    });

    // Error handling
    socketInstance.on('error', ({ message }) => {
      console.error('Socket error:', message);
      showToast(message, 'error');
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
   * Paint a single pixel.
   */
  const paintPixel = (x, y, color) => {
    if (!socket || !isConnected) {
      showToast('Not connected to server', 'error');
      return false;
    }
    socket.emit('pixel:paint', { x, y, color });
    return true;
  };

  /**
   * Paint multiple pixels (brush mode).
   * @param {Array<{x: number, y: number, color: string}>} pixels
   */
  const paintPixels = (pixels) => {
    if (!socket || !isConnected) {
      showToast('Not connected to server', 'error');
      return false;
    }
    if (!Array.isArray(pixels) || pixels.length === 0) return false;
    socket.emit('pixels:paint', { pixels });
    return true;
  };

  /**
   * Request canvas state (for reconnection).
   */
  const requestCanvas = () => {
    if (socket && isConnected) socket.emit('canvas:request');
  };

  /**
   * Request stats.
   */
  const requestStats = () => {
    if (socket && isConnected) socket.emit('stats:request');
  };

  const value = {
    socket,
    isConnected,
    paintPixel,
    paintPixels,
    requestCanvas,
    requestStats,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
