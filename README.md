# Pixel CanvasChain: Decentralized Philanthropic Art 🎨🔗

> **A Massively Multiplayer Online (MMO) Collaborative Canvas on MultiversX**
> *Merging the cultural phenomenon of r/place with the immutable trust of Web3 and a rigid philanthropic economic model.*

---

## 1. Executive Summary

Pixel CanvasChain transforms digital interaction from static consumption to dynamic, participatory creation. It is a persistent **1000x1000 pixel canvas** where every pixel represents a cryptographically verifiable unit of ownership.

Unlike standard games, this project is a **Public Good**:
* **50% of all revenue** is automatically routed via Smart Contract to Child Welfare Charities (e.g., Save the Children).
* **Hybrid Architecture** ensures a "Web2-speed" experience (instant painting) with "Web3-trust" (immutable history).

---

## 2. Architectural Paradigm: The Hybrid Commit Model

To solve the scalability limits of blockchains (latency and gas fees), we utilize a Hybrid Architecture.

### A. The Interactive Layer (Off-Chain / Fast)
* **Technology:** React (Frontend) + Node.js (Backend) + WebSockets.
* **Action:** When a user paints, they sign a message. The backend verifies the signature and credit balance off-chain.
* **Result:** Zero-latency painting and instant updates for all connected users.

### B. The Settlement Layer (On-Chain / Secure)
* **Technology:** MultiversX Smart Contract (Rust) + IPFS.
* **Action:** Every **10 minutes** (or 1,000 pixels), the backend aggregates changes into a Merkle Tree or binary blob.
* **Result:** A snapshot is uploaded to IPFS, and the hash is committed to the blockchain. This creates an immutable history without spamming the network with micro-transactions.



---

## 3. Economic Model: Behavioral & Philanthropic

### A. The Currency: $PIXEL Credits
Users deposit EGLD (or custom tokens) into the Smart Contract to receive "Painting Credits."
* **Base Rate:** 1 Token = 100 Pixels.

### B. Tiered Purchasing (Price Anchoring)
We use behavioral economics to incentivize higher volume purchases. By anchoring a base price, higher tiers offer significant "Bonus Pixels."

| Tier Name | Cost (Tokens) | Base Pixels | **Bonus Pixels** | **Total Credits** | Value Increase |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Novice** | 10 | 1,000 | 0 | **1,000** | Baseline |
| **Apprentice** | 50 | 5,000 | 500 (+10%) | **5,500** | +10% |
| **Artisan** | 100 | 10,000 | 2,000 (+20%) | **12,000** | +20% |
| **Master** | 500 | 50,000 | 15,000 (+30%) | **65,000** | +30% |
| **Legend** | 1,000 | 100,000 | 50,000 (+50%) | **150,000** | +50% |

### C. The 25/25/50 Revenue Split
Every inflow of revenue triggers the `distribute_revenue` function in the Smart Contract:
1.  ❤️ **50% Charity:** Automatically sent to verified NGO wallets (e.g., Save the Children, UNICEF).
2.  🔥 **25% Token Burn:** Sent to a null address to create deflationary pressure.
3.  🏦 **25% Treasury:** Sent to the Dev Multi-Sig for server costs and development.

---

## 4. Gameplay Mechanics

### A. The Main Canvas (1000x1000)
* **Cost:** 1 Credit per pixel.
* **Mechanic:** Click to paint. Requires `Credits > 0`.
* **Conflict:** Users can paint over others (Pixel War mechanic).

### B. The Auction Zones (50x50)
* **Location:** Specific reserved areas on the grid.
* **Cost:** **Free-to-Paint** (0 Credits).
* **Sybil Resistance:** Requires a minimum EGLD wallet balance and CAPTCHA to paint (Proof of Humanity).
* **Monetization:** At the end of an **Epoch** (7 days), this 50x50 grid is frozen, minted as an NFT, and sold via an **English Auction**. Proceeds follow the 25/25/50 split.

### C. AI "Dream" Generation
At the end of an Epoch:
1.  The final canvas state is fed into a Generative AI (e.g., Stable Diffusion).
2.  The AI generates abstract "Dream" interpretations of the community art.
3.  These unique AI NFTs are airdropped to the Top 1,000 contributors of that Epoch.

---

## 5. Technical Stack (Full Vision)
* **Frontend:** React (Vite), TailwindCSS, HTML5 Canvas API.
* **Backend:** Node.js (Express), Socket.io, Redis (Caching).
* **Smart Contract:** Rust (`multiversx-sc`).
* **Storage:** IPFS (Decentralized History).

---