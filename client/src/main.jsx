import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { initApp } from '@multiversx/sdk-dapp/out/methods/initApp/initApp';
import { EnvironmentsEnum } from '@multiversx/sdk-dapp/out/types/enums.types';

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
    },
    storage: {
      // Persist login across page refreshes
      getStorageCallback: () => window.localStorage,
    },
  });

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
