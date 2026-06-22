# Instrucțiuni de pornire — Pixel CanvasChain

Aplicația este o aplicație web (nu un executabil `.exe`). Este compusă din trei părți:

- `client/` — frontend React + Vite
- `server/` — backend Node.js (Express + Socket.io)
- `pixel-canvas-contract/` — smart contract MultiversX (Rust), deja compilat în `output/*.wasm`

---

## 1. Cerințe

- **Node.js 18+** și **npm** (verificați cu `node -v` și `npm -v`)
- Un browser modern (Chrome, Edge, Firefox)
- *(opțional)* Extensia de wallet **MultiversX DeFi** pentru funcțiile de blockchain
- *(opțional)* **Rust** + `sc-meta` — necesare DOAR dacă vreți să recompilați smart contractul

---

## 2. Configurare (fișiere `.env`)

Copiați fișierele exemplu și completați valorile:

```bash
# Backend
cp server/.env.example server/.env

# Frontend
cp client/.env.example client/.env
```

Variabile importante:

| Variabilă | Unde | Descriere |
|-----------|------|-----------|
| `PORT` | server/.env | Portul backendului (implicit `5001`) |
| `MULTIVERSX_API_URL` | server/.env | API-ul rețelei devnet MultiversX |
| `CONTRACT_ADDRESS` | server/.env | Adresa smart contractului deployat |
| `OPENAI_API_KEY` | server/.env | *(opțional)* activează generarea AI; lăsați gol pentru a o dezactiva |
| `VITE_SERVER_URL` | client/.env | URL-ul backendului (implicit `http://localhost:5001`) |
| `VITE_CONTRACT_ADDRESS` | client/.env | Adresa smart contractului |

---

## 3. Pornirea aplicației

### Pasul 1 — Backend

```bash
cd server
npm install
npm start
```

Serverul pornește pe `http://localhost:5001`.

### Pasul 2 — Frontend (mod dezvoltare)

Într-un al doilea terminal:

```bash
cd client
npm install
npm run dev
```

Deschideți în browser adresa afișată (implicit `http://localhost:5173`).

---

## 4. Build de producție (varianta „executabil" web)

Pentru a genera versiunea optimizată, gata de rulat:

```bash
cd client
npm run build      # generează folderul client/dist/
npm run preview    # servește build-ul local pentru verificare
```

Folderul `client/dist/` reprezintă „executabilul" web — fișiere statice care pot rula în orice browser, servite de orice server web.

---

## 5. Smart contract (MultiversX)

Contractul este deja compilat:

- `pixel-canvas-contract/output/pixel-canvas-contract.wasm` — binarul compilat (executabilul on-chain)
- `pixel-canvas-contract/output/pixel-canvas-contract.abi.json` — interfața (ABI)

Recompilare (opțional, necesită Rust + `sc-meta`):

```bash
cd pixel-canvas-contract
sc-meta all build
```

---

## 6. Note

- Funcțiile de **blockchain** (devnet) și **AI** necesită conexiune la internet și chei valide. Fără acestea, aplicația rulează, dar aceste funcții sunt limitate/dezactivate.
- Recomandare pentru susținere: pregătiți un **videoclip demo** ca rezervă, în caz că rețeaua din facultate este instabilă.
