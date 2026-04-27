import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useSocket } from './useSocket';

/**
 * useMockWallet - Mock wallet connection hook
 *
 * Provides wallet connection functionality for Phase 1 prototype.
 * Communicates with server to generate mock erd1... addresses.
 *
 * [FUTURE: Replace this entire hook with @multiversx/sdk-dapp hooks]
 * [FUTURE: Use useGetAccountInfo, useGetLoginInfo from sdk-dapp]
 * [FUTURE: Replace connectWallet with ExtensionLogin component]
 *
 * Example future implementation:
 * ```
 * import { useGetAccountInfo, useGetLoginInfo } from '@multiversx/sdk-dapp/hooks';
 *
 * export const useWallet = () => {
 *   const { address, balance } = useGetAccountInfo();
 *   const { isLoggedIn } = useGetLoginInfo();
 *   return { address, balance, isConnected: isLoggedIn };
 * };
 * ```
 */

export const useMockWallet = () => {
  const { wallet, connectWallet: setWalletState, showToast, setIsLoading } = useApp();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);

  /**
   * Connect mock wallet
   * Requests server to generate random erd1... address
   * [FUTURE: Replace with real MultiversX wallet authentication]
   */
  const connectWallet = async () => {
    if (!socket) {
      showToast('Socket not connected. Please refresh the page.', 'error');
      return false;
    }

    if (wallet.isConnected) {
      showToast('Wallet already connected', 'info');
      return true;
    }

    setIsConnecting(true);
    setIsLoading(true);

    try {
      // Request wallet connection from server
      socket.emit('wallet:connect');

      // Wait for server response
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          setIsConnecting(false);
          setIsLoading(false);
          showToast('Wallet connection timeout', 'error');
          resolve(false);
        }, 10000); // 10 second timeout

        socket.once('wallet:connected', (data) => {
          clearTimeout(timeout);

          // Update app context
          setWalletState(data.address, data.egld, data.credits, data.gridState);

          setIsConnecting(false);
          setIsLoading(false);

          // Auto-navigate to shop
          setTimeout(() => {
            navigate('/shop');
          }, 500);

          resolve(true);
        });

        socket.once('error', (error) => {
          clearTimeout(timeout);
          setIsConnecting(false);
          setIsLoading(false);
          showToast(error.message || 'Failed to connect wallet', 'error');
          resolve(false);
        });
      });
    } catch (error) {
      console.error('Wallet connection error:', error);
      showToast('Failed to connect wallet', 'error');
      setIsConnecting(false);
      setIsLoading(false);
      return false;
    }
  };

  /**
   * Get truncated wallet address for display
   * e.g., "erd1abc...xyz"
   */
  const getTruncatedAddress = () => {
    if (!wallet.address) return '';
    const addr = wallet.address;
    return `${addr.slice(0, 8)}...${addr.slice(-3)}`;
  };

  /**
   * Check if wallet is connected
   */
  const isConnected = wallet.isConnected;

  /**
   * Get wallet data
   */
  const getWallet = () => wallet;

  return {
    // State
    address: wallet.address,
    egld: wallet.egld,
    credits: wallet.credits,
    isConnected,
    isConnecting,

    // Methods
    connectWallet,
    getTruncatedAddress,
    getWallet,
  };
};
