import { useState, useEffect, useCallback } from 'react';
import { Address } from '@multiversx/sdk-core/out/core/address';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const API_URL = import.meta.env.VITE_API_URL;

/**
 * Decode a base64-encoded BigUint returned by the MultiversX VM.
 * The VM encodes BigUint as big-endian bytes.
 *
 * @param {string} base64 - base64 string from returnData[]
 * @returns {number} decoded integer value
 */
function decodeBase64BigUint(base64) {
  if (!base64) return 0;
  const binary = atob(base64);
  let value = 0;
  for (let i = 0; i < binary.length; i++) {
    value = value * 256 + binary.charCodeAt(i);
  }
  return value;
}

/**
 * useContractCredits — polls getPaintingCredits(address) from the smart contract
 *
 * @param {string|null} address - bech32 wallet address
 * @param {number} pollIntervalMs - polling interval in ms (default: 15 000)
 *
 * Returns:
 *  - credits        — current on-chain credit balance (number)
 *  - isLoading      — true during first fetch
 *  - refetchCredits — call this to force an immediate refresh (e.g. after a purchase)
 */
export const useContractCredits = (address, pollIntervalMs = 15_000) => {
  const [credits, setCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCredits = useCallback(async () => {
    if (!address || !CONTRACT_ADDRESS || !API_URL) return;

    try {
      setIsLoading(true);

      // Convert bech32 address to hex for contract call argument
      const hexAddr = Address.newFromBech32(address).toHex();

      const response = await fetch(`${API_URL}/vm-values/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scAddress: CONTRACT_ADDRESS,
          funcName: 'getPaintingCredits',
          args: [hexAddr],
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const json = await response.json();

      // MultiversX API wraps the VM response inside two levels of `data`:
      //   { data: { blockInfo: ..., data: { returnData: [...], returnCode: "ok" } }, code: "successful" }
      // The one-level lookup we had before always returned 0 even when credits existed.
      const returnData =
        json?.data?.data?.returnData?.[0] ??
        json?.data?.returnData?.[0] ??
        json?.returnData?.[0];
      setCredits(decodeBase64BigUint(returnData));
    } catch (err) {
      console.error('[useContractCredits] Failed to fetch:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  // Fetch on mount + whenever address changes
  useEffect(() => {
    fetchCredits();
    const interval = setInterval(fetchCredits, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchCredits, pollIntervalMs]);

  return { credits, isLoading, refetchCredits: fetchCredits };
};
