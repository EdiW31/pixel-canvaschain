/**
 * contractClient.js — Read-only MultiversX devnet queries
 *
 * Phase 2: Only reads are performed server-side (no gas cost).
 * - queryCredits(address) → calls getPaintingCredits view on the contract
 *
 * consumeCredits is intentionally NOT called from the server.
 * Credits are decremented locally per-session; the on-chain balance is
 * the source of truth only at session start.
 */

import { Address } from '@multiversx/sdk-core/out/core/address.js';

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const API_URL = process.env.MULTIVERSX_API_URL ?? 'https://devnet-api.multiversx.com';

/**
 * Decode a base64-encoded BigUint returned by the MultiversX VM.
 * The VM encodes BigUint as big-endian bytes.
 *
 * @param {string} base64
 * @returns {number}
 */
function decodeBase64BigUint(base64) {
  if (!base64) return 0;
  const binary = Buffer.from(base64, 'base64');
  let value = 0;
  for (const byte of binary) {
    value = value * 256 + byte;
  }
  return value;
}

/**
 * Query painting credits for a wallet address from the smart contract.
 *
 * @param {string} bech32Address — erd1... wallet address
 * @returns {Promise<number>} — current on-chain credit balance (0 on error)
 */
export async function queryCredits(bech32Address) {
  if (!CONTRACT_ADDRESS || !bech32Address) return 0;

  try {
    const hexAddr = Address.newFromBech32(bech32Address).toHex();

    const response = await fetch(`${API_URL}/vm-values/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scAddress: CONTRACT_ADDRESS,
        funcName: 'getPaintingCredits',
        args: [hexAddr],
      }),
    });

    if (!response.ok) {
      console.warn(`[contractClient] vm-values/query HTTP ${response.status}`);
      return 0;
    }

    const json = await response.json();
    // The API wraps the VM response in two levels of `data`:
    //   { data: { blockInfo, data: { returnData: [...], returnCode } }, code }
    const returnData =
      json?.data?.data?.returnData?.[0] ??
      json?.data?.returnData?.[0] ??
      json?.returnData?.[0];
    return decodeBase64BigUint(returnData);
  } catch (err) {
    console.error('[contractClient] queryCredits error:', err.message);
    return 0;
  }
}
