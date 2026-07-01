import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { initApp } from '@multiversx/sdk-dapp/out/methods/initApp/initApp';
import { EnvironmentsEnum } from '@multiversx/sdk-dapp/out/types/enums.types';
import { restoreProvider } from '@multiversx/sdk-dapp/out/providers/helpers/restoreProvider';

// Initialise the MultiversX sdk-dapp store before rendering React. The store is
// module-level, so hooks like useGetAccountInfo() work without a context wrapper.
async function bootstrap() {
  await initApp({
    dAppConfig: {
      environment: EnvironmentsEnum.devnet,
      nativeAuth: false,
      callbackUrl: `${window.location.origin}/shop`,
      providers: {
        walletConnect: {
          walletConnectV2ProjectId: import.meta.env.VITE_WALLET_CONNECT_ID ?? '',
        },
      },
    },
    storage: {
      getStorageCallback: () => window.localStorage,
    },
  });

  // After a Web Wallet redirect the persisted login survives but the in-memory
  // provider singleton is gone; restoreProvider() rebuilds it so signing resumes.
  try {
    await restoreProvider();
  } catch (err) {
    // Harmless on first load. If signs later fail with "declined", a stale
    // WalletConnect session is likely — have the user disconnect + reconnect.
    console.warn(
      '[bootstrap] restoreProvider failed — stale WC session likely; user should reconnect:',
      err,
    );
  }

  // <React.StrictMode> intentionally omitted: its dev double-mount makes the
  // sdk-dapp-ui side panels (xPortal QR) close prematurely. No prod impact.
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
}

bootstrap();
