import { useEffect, useRef } from 'react';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetIsLoggedIn } from '@multiversx/sdk-dapp/out/react/account/useGetIsLoggedIn';
import { UnlockPanelManager } from '@multiversx/sdk-dapp/out/managers/UnlockPanelManager/UnlockPanelManager';
import { ProviderFactory } from '@multiversx/sdk-dapp/out/providers/ProviderFactory';
import { DappProvider } from '@multiversx/sdk-dapp/out/providers/DappProvider/DappProvider';
import {
  getAccountProvider,
  setAccountProvider,
} from '@multiversx/sdk-dapp/out/providers/helpers/accountProvider';

// Active DappProvider for signing. Falls back to an EmptyProvider stub if none
// is registered yet, so callers can check provider.getType() before using it.
export const getDappProvider = () => getAccountProvider();

// useWallet — MultiversX wallet integration via sdk-dapp v5.
export const useWallet = () => {
  const { address, account } = useGetAccountInfo();
  const isLoggedIn = useGetIsLoggedIn();
  const wasLoggedInRef = useRef(false);

  // Mark that we've been logged in so the mirror-logout effect below doesn't
  // fire on initial load (when isLoggedIn is false before any login attempt).
  useEffect(() => { if (isLoggedIn) wasLoggedInRef.current = true; }, [isLoggedIn]);

  // When the phone deletes the WalletConnect session, sdk-dapp flips isLoggedIn
  // to false. Mirror that locally by clearing the provider, so we don't keep
  // handing out a dead one that makes every signTransactions() come back declined.
  useEffect(() => {
    if (wasLoggedInRef.current && !isLoggedIn) {
      try { setAccountProvider(null); } catch (_) {}
      document.querySelector('mvx-wallet-connect')?.remove();
    }
  }, [isLoggedIn]);

  // Balance arrives as a string of smallest EGLD units (1 EGLD = 10^18).
  const balanceRaw = account?.balance ?? '0';
  const egld = parseFloat((Number(balanceRaw) / 1e18).toFixed(4));

  // Open the sdk-dapp wallet picker. onSuccess fires after login; onClose if the
  // user dismisses the panel without logging in.
  const openLogin = (onSuccess, onClose) => {
    UnlockPanelManager.init({
      loginHandler: async ({ type, anchor }) => {
        // Do NOT forward `anchor` (the unlock-panel host) to ProviderFactory:
        // it makes the WalletConnect QR mount inside the panel and vanish when
        // the panel transitions. Defaulting mounts it on document.body instead.
        void anchor;

        // If a prior WalletConnect session is half-alive in storage, clear it
        // before creating a new one — otherwise the new login layers on a stale
        // pairing the phone no longer trusts and every sign comes back declined.
        try {
          const stale = getAccountProvider();
          if (stale && stale.getType?.() !== 'empty') {
            await stale.logout?.({ shouldBroadcastLogoutAcrossTabs: false }).catch(() => {});
          }
          setAccountProvider(null);
        } catch (err) {
          console.warn('[useWallet] stale-session cleanup failed:', err);
        }

        const raw = await ProviderFactory.create({ type });
        await raw.login();

        // Remove the QR panel left mounted on body after an xPortal scan.
        document.querySelector('mvx-wallet-connect')?.remove();

        // Wrap in DappProvider (redirect flows + WC sessions) and register it.
        const dappProvider = new DappProvider(raw);
        setAccountProvider(dappProvider);

        if (onSuccess) onSuccess();
      },
      onClose: async () => {
        if (onClose) onClose();
      },
    }).openUnlockPanel();
  };

  const logout = async () => {
    const provider = getAccountProvider();
    if (!provider || provider.getType?.() === 'empty') return;
    try {
      await provider.logout({ shouldBroadcastLogoutAcrossTabs: true });
    } catch (err) {
      // A network blip during WC session_delete must not leave a dead provider
      // hanging around — the finally block clears it regardless.
      console.warn('[useWallet] logout error:', err);
    } finally {
      setAccountProvider(null);
    }
  };

  // "erd1abc...xyz" for display.
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
