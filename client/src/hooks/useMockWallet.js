/**
 * useMockWallet — backward-compat shim
 *
 * Phase 1 components import from this file.
 * Phase 2 forwards everything to the real useWallet hook.
 */

import { useApp } from '../context/AppContext';
import { useWallet } from './useWallet';

export const useMockWallet = () => {
  const { wallet } = useApp();
  const { address, egld, isConnected, openLogin, getTruncatedAddress } = useWallet();

  /**
   * connectWallet — calls the real sdk-dapp UnlockPanel
   * Returns a Promise that resolves true once the user logs in.
   */
  const connectWallet = () =>
    new Promise((resolve) => {
      openLogin(
        () => resolve(true),   // onSuccess
        () => resolve(false),  // onClose without login
      );
    });

  return {
    address,
    egld,
    credits: wallet.credits,
    isConnected,
    isConnecting: false, // sdk-dapp panel manages its own loading state
    connectWallet,
    getTruncatedAddress,
    getWallet: () => wallet,
  };
};
