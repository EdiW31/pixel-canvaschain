# Blockchain Integration Layer

This directory is a placeholder for future MultiversX blockchain integration.

## Phase 1 (Current): Mock Implementation
- Wallet addresses are randomly generated (erd1...)
- Balances are stored in memory
- Transactions are simulated with 2-second delays

## Phase 2: MultiversX SDK Integration

### Installation
```bash
npm install @multiversx/sdk-core @multiversx/sdk-wallet @multiversx/sdk-network-providers
```

### Planned Integration Points

#### 1. Wallet Connection
**Current:** `server.js` - `generateMockWalletAddress()`
**Future:** Use MultiversX wallet authentication
- xPortal Mobile App
- Browser Extension (DeFi Wallet)
- Web Wallet
- Ledger Hardware Wallet

**Code Example:**
```javascript
import { ExtensionProvider } from '@multiversx/sdk-dapp/web';

async function connectWallet() {
  const provider = ExtensionProvider.getInstance();
  await provider.init();
  const address = await provider.login();
  return address;
}
```

#### 2. Balance Queries
**Current:** `userManager.js` - In-memory balance tracking
**Future:** Query real EGLD balance from blockchain

**Code Example:**
```javascript
import { ApiNetworkProvider } from '@multiversx/sdk-network-providers';

async function getEgldBalance(address) {
  const provider = new ApiNetworkProvider('https://devnet-api.multiversx.com');
  const account = await provider.getAccount(address);
  return account.balance.toString();
}
```

#### 3. Credit Purchase Transactions
**Current:** `server.js` - Simulated 2s delay, in-memory balance updates
**Future:** Smart Contract transaction with 25/25/50 revenue split

**Code Example:**
```javascript
import { Transaction, TransactionPayload } from '@multiversx/sdk-core';

async function purchaseCredits(tier, signer) {
  const tx = new Transaction({
    receiver: 'erd1...contract_address',
    value: tier.cost,
    gasLimit: 60000000,
    data: new TransactionPayload(`purchaseCredits@${tier.name}`)
  });

  await signer.sign(tx);
  await provider.sendTransaction(tx);
  return await provider.awaitTransactionCompletion(tx.hash);
}
```

#### 4. Pixel Aggregation & IPFS Snapshots
**Current:** `pixelGrid.js` - In-memory only
**Future:** Upload canvas snapshots to IPFS every 10 minutes, commit hash to blockchain

**Code Example:**
```javascript
import { create as ipfsClient } from 'ipfs-http-client';

async function uploadToIPFS() {
  const ipfs = ipfsClient({ url: 'https://ipfs.infura.io:5001' });
  const gridData = pixelGrid.getCompressedGrid();
  const result = await ipfs.add(gridData);

  // Commit IPFS hash to smart contract
  const tx = new Transaction({
    receiver: 'erd1...contract_address',
    data: new TransactionPayload(`commitSnapshot@${result.path}`)
  });

  return result.path; // Returns IPFS hash (QmXxx...)
}
```

#### 5. Smart Contract Deployment
**Language:** Rust (multiversx-sc framework)

**Contract Functions:**
- `purchaseCredits(tier: TierName) -> u64` - Buy credits, distribute revenue
- `commitSnapshot(ipfsHash: String) -> bool` - Store canvas snapshot hash
- `getCredits(address: Address) -> u64` - Query user's credit balance
- `distributeRevenue() -> (u64, u64, u64)` - Split funds: 50% charity, 25% burn, 25% treasury

**Files to Create:**
- `smart-contract/src/lib.rs` - Main contract logic
- `smart-contract/Cargo.toml` - Dependencies
- `smart-contract/tests/` - Integration tests

## Phase 3: Advanced Features

### 1. Auction Zones (NFT Minting)
- Freeze 50x50 grid sections every 7 days
- Mint as NFT using ESDT (MultiversX NFT standard)
- English auction on MultiversX DEX

### 2. AI Dream NFT Airdrops
- Generate AI art from canvas state
- Mint NFTs for top 1,000 contributors
- Airdrop via Smart Contract

### 3. Leaderboard & Reputation
- Track paint count on-chain
- Issue SBTs (Soulbound Tokens) for achievements

## Testing

### Devnet Deployment
```bash
mxpy contract deploy --bytecode=output/contract.wasm \
  --proxy=https://devnet-gateway.multiversx.com \
  --recall-nonce --pem=wallet.pem \
  --gas-limit=60000000 --send
```

### Testnet Faucet
Get test EGLD: https://devnet-wallet.multiversx.com/faucet

### Mainnet Deployment
- Requires multi-sig for treasury wallet
- Full security audit before launch
- Gradual rollout with circuit breakers

## Resources
- [MultiversX Docs](https://docs.multiversx.com/)
- [Smart Contract Framework](https://docs.multiversx.com/developers/developer-reference/sc-framework/)
- [SDK Core](https://github.com/multiversx/mx-sdk-js-core)
- [IPFS](https://ipfs.io/)

---

**Status:** Phase 1 (Mock Implementation) ✅
**Next:** Phase 2 (SDK Integration) 🚧
