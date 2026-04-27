import { useEffect, useState, createContext, useContext } from 'react';
import { io } from 'socket.io-client';
import { useApp } from '../context/AppContext';

/**
 * Socket Context for providing socket instance throughout the app
 */
const SocketContext = createContext();

/**
 * useSocket - Hook to access socket instance and connection state
 */
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

/**
 * SocketProvider - Manages Socket.io connection lifecycle
 *
 * Establishes connection on mount, handles reconnection, and provides
 * socket instance to all child components via context.
 *
 * [FUTURE: Add authentication token for WebSocket connection]
 * [FUTURE: Sign messages with wallet before emitting]
 */
export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const { updatePixel, updateCredits, showToast, setGridState } = useApp();

  useEffect(() => {
    // Connect to server
    // In development, Vite proxy handles /socket.io -> localhost:5001
    const socketInstance = io('http://localhost:5001', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    // Connection events
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

    // Game events
    socketInstance.on('pixel:update', ({ x, y, color, address }) => {
      // Update local grid state for real-time collaboration
      updatePixel(x, y, color);
      console.log(`🎨 Pixel update: (${x}, ${y}) ${color}`);
    });

    socketInstance.on('pixels:update', ({ pixels, address }) => {
      // Update multiple pixels for brush painting
      pixels.forEach(({ x, y, color }) => {
        updatePixel(x, y, color);
      });
      console.log(`🎨 Batch pixel update: ${pixels.length} pixels`);
    });

    socketInstance.on('canvas:init', ({ gridState }) => {
      // Load initial canvas state
      setGridState(gridState);
      console.log('🖼️  Canvas initialized');
    });

    socketInstance.on('credits:updated', ({ credits }) => {
      // Update credit balance after painting
      updateCredits(credits);
    });

    socketInstance.on('credits:purchased', ({ tier, cost, credits, newEgld, newCredits }) => {
      // Update balances after purchase
      updateCredits(newCredits);
      showToast(`Successfully purchased ${tier}! +${credits} credits`, 'success');
    });

    // Error handling
    socketInstance.on('error', ({ message }) => {
      console.error('Socket error:', message);
      showToast(message, 'error');
    });

    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      socketInstance.disconnect();
    };
  }, []); // Empty dependency - connect once on mount

  /**
   * Purchase credits from a tier
   * [FUTURE: Sign transaction with wallet before emitting]
   */
  const purchaseCredits = (tierName) => {
    if (!socket || !isConnected) {
      showToast('Not connected to server', 'error');
      return;
    }

    socket.emit('credits:purchase', { tierName });
  };

  /**
   * Paint a pixel
   * [FUTURE: Sign paint action with wallet for verification]
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
   * Paint multiple pixels (brush mode)
   * @param {Array<{x: number, y: number, color: string}>} pixels - Array of pixels to paint
   */
  const paintPixels = (pixels) => {
    if (!socket || !isConnected) {
      showToast('Not connected to server', 'error');
      return false;
    }

    if (!Array.isArray(pixels) || pixels.length === 0) {
      return false;
    }

    socket.emit('pixels:paint', { pixels });
    return true;
  };

  /**
   * Request canvas state (for reconnection)
   */
  const requestCanvas = () => {
    if (!socket || !isConnected) return;
    socket.emit('canvas:request');
  };

  /**
   * Request stats
   */
  const requestStats = () => {
    if (!socket || !isConnected) return;
    socket.emit('stats:request');
  };

  const value = {
    socket,
    isConnected,
    purchaseCredits,
    paintPixel,
    paintPixels,
    requestCanvas,
    requestStats,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
