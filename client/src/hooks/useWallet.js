import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetIsLoggedIn } from '@multiversx/sdk-dapp/out/react/account/useGetIsLoggedIn';
import { UnlockPanelManager } from '@multiversx/sdk-dapp/out/managers/UnlockPanelManager/UnlockPanelManager';
import { ProviderFactory } from '@multiversx/sdk-dapp/out/providers/ProviderFactory';
import { DappProvider } from '@multiversx/sdk-dapp/out/providers/DappProvider/DappProvider';
import {
  getAccountProvider,
  setAccountProvider,
} from '@multiversx/sdk-dapp/out/providers/helpers/accountProvider';

/**
 * Get the active DappProvider for signing transactions.
 *
 * Always returns a DappProvider — sdk-dapp's helper falls back to an
 * EmptyProvider stub if no real provider has been registered yet, so
 * callers can safely check `provider.getType()` before using it.
 *
 * The provider is registered via setAccountProvider() inside loginHandler
 * (and rehydrated by restoreProvider() in main.jsx after page reloads).
 */
export const getDappProvider = () => getAccountProvider();

/**
 * useWallet — Real MultiversX wallet integration via sdk-dapp v5
 *
 * Returns:
 *  - address       — bech32 wallet address (null if not logged in)
 *  - egld          — EGLD balance as a float (4 decimal places)
 *  - isConnected   — boolean, true when wallet is logged in
 *  - openLogin     — function to open the sdk-dapp UnlockPanel (wallet picker)
 *  - logout        — function to disconnect the wallet
 *  - getTruncatedAddress — helper to show "erd1abc...xyz"
 */
export const useWallet = () => {
  const { address, account } = useGetAccountInfo();
  const isLoggedIn = useGetIsLoggedIn();

  // Balance comes as a string of smallest EGLD units (1 EGLD = 10^18)
  const balanceRaw = account?.balance ?? '0';
  const egld = parseFloat((Number(balanceRaw) / 1e18).toFixed(4));

  /**
   * Open the sdk-dapp wallet picker panel.
   * @param {Function} onSuccess - called after successful login
   * @param {Function} onClose   - called if user closes panel without logging in
   */
  const openLogin = (onSuccess, onClose) => {
    UnlockPanelManager.init({
      // All providers enabled (Extension, xPortal/WalletConnect, Web Wallet, Ledger).
      // xPortal works because main.jsx omits React.StrictMode — see comment there.
      loginHandler: async ({ type, anchor }) => {
        // IMPORTANT: do NOT forward `anchor` to ProviderFactory.create.
        // The `anchor` here is the <mvx-unlock-panel> host element. Forwarding
        // it makes WalletConnect's QR panel mount inside the unlock panel —
        // when the unlock panel closes/transitions, the QR vanishes with it
        // ("hides in the corner" bug). Letting it default = mounts on
        // document.body, which is what the official template-dapp does.
        void anchor;
        const raw = await ProviderFactory.create({ type });
        await raw.login();

        // QR panel stays mounted on body after a successful xPortal scan —
        // remove it now that login is complete.
        document.querySelector('mvx-wallet-connect')?.remove();

        // Wrap in DappProvider — handles all redirect flows + WalletConnect sessions
        const dappProvider = new DappProvider(raw);

        // Register globally so sdk-dapp's internals can find it
        setAccountProvider(dappProvider);

        if (onSuccess) onSuccess();
      },
      onClose: async () => {
        if (onClose) onClose();
      },
    }).openUnlockPanel();
  };

  /**
   * Disconnect the wallet.
   */
  const logout = async () => {
    const provider = getAccountProvider();
    if (provider) {
      try {
        await provider.logout({ shouldBroadcastLogoutAcrossTabs: true });
      } catch (err) {
        console.warn('[useWallet] logout error:', err);
      }
      setAccountProvider(null);
    }
  };

  /**
   * Returns "erd1abc...xyz" for display.
   */
  const getTruncatedAddress = () => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-3)}`;
  };

  return {
    address: address || null,
    egld,
    isConnected: isLoggedIn,
    openLogin,
    logout,
    getTruncatedAddress,
  };
};
