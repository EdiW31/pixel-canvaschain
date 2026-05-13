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
    console.warn('[bootstrap] restoreProvider failed (expected on first load):', err);
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
