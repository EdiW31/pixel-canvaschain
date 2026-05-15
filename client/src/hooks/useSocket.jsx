import { useEffect, useState, createContext, useContext } from 'react';
import { io } from 'socket.io-client';
import { useApp } from '../context/AppContext';
import { useGetIsLoggedIn } from '@multiversx/sdk-dapp/out/react/account/useGetIsLoggedIn';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const { updatePixel, showToast, setGridState, addPendingPixels, clearPendingPixels } = useApp();
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

    // pixels:committed — server acknowledged PIXEL tx, clear pending
    socketInstance.on('pixels:committed', () => {
      clearPendingPixels();
    });

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
  const notifyPixelsSubmitted = (txHash) => {
    if (socket && isConnected) {
      socket.emit('pixels:submit', { txHash });
    }
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
    requestCanvas,
    requestStats,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
