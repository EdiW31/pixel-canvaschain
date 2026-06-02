import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { initApp } from '@multiversx/sdk-dapp/out/methods/initApp/initApp';
import { EnvironmentsEnum } from '@multiversx/sdk-dapp/out/types/enums.types';
import { restoreProvider } from '@multiversx/sdk-dapp/out/providers/helpers/restoreProvider';

/**
 * Bootstrap: initialise the MultiversX sdk-dapp store BEFORE rendering React.
 * The store (Zustand) is module-level, so hooks like useGetAccountInfo()
 * work without any React context wrapper.
 */
async function bootstrap() {
  await initApp({
    dAppConfig: {
      environment: EnvironmentsEnum.devnet,
      nativeAuth: false,
      // Web Wallet redirects back here after signing.
      callbackUrl: `${window.location.origin}/shop`,
      // Provider-specific config (xPortal needs WalletConnect v2 project ID)
      providers: {
        walletConnect: {
          walletConnectV2ProjectId: import.meta.env.VITE_WALLET_CONNECT_ID ?? '',
        },
      },
    },
    storage: {
      // Persist login across page refreshes
      getStorageCallback: () => window.localStorage,
    },
  });

  // After a Web Wallet redirect, the persisted login type is still in storage
  // but the in-memory provider singleton is gone. restoreProvider() rebuilds
  // it via ProviderFactory so signing can resume seamlessly.
  try {
    await restoreProvider();
  } catch (err) {
    // On first load this is harmless (no persisted session to restore).
    // After a prior crash or aborted disconnect, however, the persisted
    // WalletConnect session may be corrupted — in which case
    // useGetIsLoggedIn() will return true but signTransactions() will
    // always come back as "declined". If you see this AND signs are
    // failing, ask the user to disconnect + reconnect to clear it.
    console.warn(
      '[bootstrap] restoreProvider failed — stale WC session likely; user should reconnect:',
      err,
    );
  }

  // NOTE: <React.StrictMode> intentionally omitted.
  // StrictMode's dev-only double-mount triggers Stencil web components
  // (sdk-dapp-ui side panels — xPortal QR, etc.) to fire closeWithAnimation()
  // prematurely, making the QR panel "hide in the corner" right after opening.
  // Production builds never run StrictMode anyway, so removing it has no
  // runtime impact — just less dev-time double-render checks.
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
}

bootstrap();
