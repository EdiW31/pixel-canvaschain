import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'https://devnet-api.multiversx.com';
const PIXEL_TOKEN_ID = import.meta.env.VITE_PIXEL_TOKEN_ID ?? 'PIXEL-a7cad6';

/**
 * usePixelBalance — polls the PIXEL ESDT token balance for a wallet address.
 * Returns the balance as a plain integer (denomination = 1, so 1 token = 1 PIXEL).
 */
export const usePixelBalance = (address, pollIntervalMs = 20_000) => {
  const [balance, setBalance] = useState(0);

  const fetchBalance = useCallback(async () => {
    if (!address) { setBalance(0); return; }
    try {
      const res = await fetch(
        `${API_URL}/accounts/${address}/tokens/${PIXEL_TOKEN_ID}`
      );
      if (!res.ok) { setBalance(0); return; }
      const data = await res.json();
      setBalance(parseInt(data.balance ?? '0', 10));
    } catch {
      setBalance(0);
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchBalance, pollIntervalMs]);

  return { pixelBalance: balance, refetchPixelBalance: fetchBalance };
};
