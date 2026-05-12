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
      // Use the full current URL so the CrossWindowProvider can
      // resume the pending session from the query params it appended.
      callbackUrl: `${window.location.origin}/shop`,
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

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
