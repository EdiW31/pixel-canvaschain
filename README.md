# Pixel CanvasChain: Decentralized Philanthropic Art 🎨🔗

> **A Massively Multiplayer Online (MMO) Collaborative Canvas on MultiversX**
> *Merging the cultural phenomenon of r/place with the immutable trust of Web3 and a rigid philanthropic economic model.*

---

## 1. Executive Summary

Pixel CanvasChain transforms digital interaction from static consumption to dynamic, participatory creation. It is a persistent **100×100 pixel canvas** where every pixel represents a cryptographically verifiable unit of ownership.

Unlike standard games, this project is a **Public Good**:
* A configurable share of all revenue is routed via Smart Contract to **community-voted Child Welfare Charities** (e.g., Save the Children, UNICEF).
* **Hybrid Architecture** ensures a "Web2-speed" experience (instant painting) with "Web3-trust" (immutable, per-epoch history).

---

## 2. Architectural Paradigm: The Hybrid Commit Model

To solve the scalability limits of blockchains (latency and gas fees), we utilize a Hybrid Architecture. The repository is split into three parts: `client/` (frontend), `server/` (backend), and `pixel-canvas-contract/` (smart contract).

### A. The Interactive Layer (Off-Chain / Fast)
* **Technology:** React (Frontend) + Node.js (Backend) + WebSockets (Socket.io).
* **Action:** When a user paints, they sign a message. The backend verifies the signature and credit balance off-chain, then broadcasts the update to all connected clients in real time.
* **Persistence:** The live grid is kept in memory and persisted to a **SQLite** database (`better-sqlite3`) so the canvas survives restarts.
* **Result:** Zero-latency painting and instant updates for all connected users.

### B. The Settlement Layer (On-Chain / Secure)
* **Technology:** MultiversX Smart Contract (Rust, `multiversx-sc`).
* **Action:** At the end of each **Epoch** the backend renders a **PNG snapshot** of the canvas (`sharp`) and commits the epoch on-chain via the `endEpoch` endpoint, passing the snapshot/auction image URIs.
* **Result:** An immutable, per-epoch history of the artwork and its philanthropic distributions — without spamming the network with micro-transactions.

> *Roadmap:* decentralized snapshot storage (IPFS) is planned; the current implementation serves snapshots from the backend via dedicated HTTP routes.

---

## 3. Economic Model: Behavioral & Philanthropic

### A. The Currency: $PIXEL Credits
Users deposit EGLD (or a custom ESDT token) into the Smart Contract to receive "Painting Credits."
* **Cost:** 1 Credit per pixel on the main canvas.

### B. Tiered Purchasing (Price Anchoring)
We use behavioral economics to incentivize higher volume purchases. By anchoring a base price, higher tiers offer significant "Bonus Pixels." (Tier definitions live in `server/src/constants.js`; on-chain prices are configured in the contract.)

| Tier Name | Cost (EGLD) | Base Pixels | **Bonus Pixels** | **Total Credits** | Value Increase |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Novice** | 10 | 1,000 | 0 | **1,000** | Baseline |
| **Apprentice** | 50 | 5,000 | 500 (+10%) | **5,500** | +10% |
| **Artisan** | 100 | 10,000 | 2,000 (+20%) | **12,000** | +20% |
| **Master** | 500 | 50,000 | 15,000 (+30%) | **65,000** | +30% |
| **Legend** | 1,000 | 100,000 | 50,000 (+50%) | **150,000** | +50% |

### C. Philanthropic Distribution & Charity Voting
Every inflow of revenue feeds the philanthropic model (charity-first split, with burn/treasury allocations for sustainability and deflationary pressure):
1.  ❤️ **Charity:** The dominant share is sent to verified NGO wallets.
2.  🔥 **Token Burn:** A portion is removed from supply to create deflationary pressure.
3.  🏦 **Treasury:** A portion funds server costs and continued development.

**Community charity voting (implemented on-chain):** each epoch can list **up to 5 candidate charities**. Wallets cast **one vote per epoch** (`vote` endpoint), and at `endEpoch` the accumulated EGLD is sent to the **vote-winning charity** (falling back to the default charity if there are no votes), while accumulated $PIXEL is flushed to the charity address.

---

## 4. Gameplay Mechanics

### A. The Main Canvas (100×100)
* **Cost:** 1 Credit per pixel.
* **Mechanic:** Click to paint. Requires `Credits > 0`.
* **Conflict:** Users can paint over others (Pixel War mechanic).

### B. The Auction Zones (20×20)
* **Location:** A reserved section of the grid, opened via `startEpochWithAuction`.
* **Monetization:** At the end of an **Epoch**, this 20×20 zone is frozen, rendered, minted as an NFT, and sold via an **English Auction** (configurable duration, default 24h). Proceeds follow the philanthropic split.

### C. AI Co-Creation ("Painter" NFTs)
At the end of an Epoch, an AI pipeline reinterprets the collaborative artwork:
1.  The final canvas snapshot is captioned by a **vision model (OpenAI GPT-4o)** in one descriptive sentence.
2.  The caption drives an **image model (`gpt-image-1`)** that generates a 1024×1024 painterly reinterpretation.
3.  These artifacts back the per-epoch **NFTs** awarded to top contributors. The pipeline is fire-and-forget: if `OPENAI_API_KEY` is unset or a step fails, the NFT gracefully falls back to the raw canvas snapshot.

---

## 5. Technical Stack (Current Implementation)
* **Frontend:** React (Vite), TailwindCSS, HTML5 Canvas API, Recharts; MultiversX integration via `@multiversx/sdk-dapp` and `@multiversx/sdk-core`.
* **Backend:** Node.js (Express), Socket.io (real-time), `better-sqlite3` (persistence), `sharp` (PNG snapshots), `@multiversx/sdk-wallet`/`sdk-core` (signature verification & chain queries), OpenAI SDK (AI pipeline).
* **Smart Contract:** Rust (`multiversx-sc`) — deployed to MultiversX **devnet**; compiled artifacts in `pixel-canvas-contract/output/` (`.wasm` + `.abi.json`).
* **Storage:** Server-side per-epoch PNG snapshots (served over HTTP); immutable history committed on-chain. *(IPFS planned.)*

---

## 6. Getting Started

See **[`startapp.md`](./startapp.md)** for full setup and run instructions. In short:

```bash
# Backend
cd server && npm install && npm start      # http://localhost:5001

# Frontend (separate terminal)
cd client && npm install && npm run dev     # http://localhost:5173
```

Copy `server/.env.example` → `server/.env` and `client/.env.example` → `client/.env` first. The smart contract is pre-compiled in `pixel-canvas-contract/output/`; rebuild with `sc-meta all build`.
