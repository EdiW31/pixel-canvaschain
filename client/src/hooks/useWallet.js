import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetIsLoggedIn } from '@multiversx/sdk-dapp/out/react/account/useGetIsLoggedIn';
import { UnlockPanelManager } from '@multiversx/sdk-dapp/out/managers/UnlockPanelManager/UnlockPanelManager';
import { ProviderFactory } from '@multiversx/sdk-dapp/out/providers/ProviderFactory';

/**
 * Module-level provider singleton.
 * Lives outside React so it survives re-renders and page navigations.
 * Access it via getDappProvider() when you need to sign transactions.
 */
let _dappProvider = null;
export const getDappProvider = () => _dappProvider;

/**
 * useWallet — Real MultiversX wallet integration via sdk-dapp v5
 *
 * Replaces the old useMockWallet hook.
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
      loginHandler: async ({ type, anchor }) => {
        // Create the concrete provider (Extension, WalletConnect, WebWallet, Ledger)
        _dappProvider = await ProviderFactory.create({ type, anchor });
        await _dappProvider.login();
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
    if (_dappProvider) {
      await _dappProvider.logout({ shouldBroadcastLogoutAcrossTabs: true });
      _dappProvider = null;
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
