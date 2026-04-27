# Pixel CanvasChain - Complete Developer Guide

## Project Overview

**Pixel CanvasChain** is a full-stack collaborative pixel art canvas application inspired by r/place. It's built as a Phase 1 prototype with mock blockchain features, preparing for future MultiversX blockchain integration.

### Tech Stack
- **Backend**: Node.js + Express + Socket.io (WebSocket real-time communication)
- **Frontend**: React 18 + Vite + TailwindCSS
- **Communication**: Socket.io (bidirectional real-time events)
- **State Management**: React Context API
- **Routing**: React Router v6

---

## Architecture: How Everything Connects

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Client    │◄─────────────────────────►│   Server    │
│  (React)    │    Socket.io Events       │  (Node.js)  │
│  Port 5173  │                           │  Port 5001  │
└─────────────┘                           └─────────────┘
       │                                          │
       │                                          │
       ▼                                          ▼
 [AppContext]                              [pixelGrid]
 [useSocket]                               [userManager]
 [Pages/Components]                        [constants]
```

### Data Flow Example: Painting a Pixel

1. User clicks canvas at (500, 500)
2. **Client**: `useCanvas` hook calculates coordinates
3. **Client**: Calls `paintPixel(500, 500, '#FF0000')` from `useSocket`
4. **Socket.io**: Emits `pixel:paint` event to server
5. **Server**: Receives event in `server.js` line 154
6. **Server**: Validates credits, coordinates, color, rate limit
7. **Server**: Updates `pixelGrid` at (500, 500)
8. **Server**: Deducts 1 credit from `userManager`
9. **Server**: Broadcasts `pixel:update` to ALL clients (line 201)
10. **All Clients**: Receive event in `useSocket.jsx` line 62
11. **All Clients**: Update local `gridState` via `updatePixel()`
12. **All Clients**: Canvas re-renders showing the red pixel

---

## Backend (Server) - File by File

### 📁 `server/src/constants.js`

**Purpose**: Single source of truth for all configuration

**Key Exports**:
- `TIERS`: Array of 5 tier objects with pricing and bonus structure
  ```javascript
  {
    name: 'Artisan',
    cost: 100,           // EGLD price
    basePixels: 10000,   // Base credits
    bonusPixels: 2000,   // Bonus (20%)
    total: 12000,        // Total received
    bonusPercent: 20,
    color: '#a855f7'     // UI color
  }
  ```
- `INITIAL_EGLD`: 100 (fake EGLD given to new users)
- `CANVAS_WIDTH/HEIGHT`: 1000 (canvas dimensions)
- `MAX_PIXELS_PER_SECOND`: 10 (rate limiting)
- `COST_PER_PIXEL`: 1 (credit cost per pixel)

**How to Modify**:
- Change tier prices: Edit `cost` property
- Change bonus amounts: Edit `bonusPixels` and `bonusPercent`
- Change canvas size: Edit `CANVAS_WIDTH` and `CANVAS_HEIGHT` (affects memory!)

---

### 📁 `server/src/pixelGrid.js`

**Purpose**: Manages the 1000x1000 pixel canvas in memory

**Data Structure**:
```javascript
this.grid = [
  [color, color, ...],  // Row 0 (1000 pixels)
  [color, color, ...],  // Row 1
  // ... 1000 rows total
]
```
- Each cell stores a hex color string (e.g., `#FF0000`)
- Initialized with `#FFFFFF` (white)
- Stored in RAM (volatile - resets on server restart)

**Key Methods**:
1. **`getGrid()`**: Returns entire 1000x1000 array
   - Used when client connects to load initial canvas state

2. **`getPixel(x, y)`**: Returns color at specific coordinate
   - Validates bounds (0-999)

3. **`setPixel(x, y, color)`**: Updates pixel color
   - Validates coordinates and hex format
   - Updates `lastModified` timestamp

4. **`isValidCoordinate(x, y)`**: Boundary check
   - Returns true if 0 ≤ x < 1000 and 0 ≤ y < 1000

5. **`isValidColor(color)`**: Regex validation
   - Pattern: `/^#[0-9A-Fa-f]{6}$/` (e.g., `#FF0000`)

6. **`getStats()`**: Canvas analytics
   - Counts painted vs unpainted pixels
   - Counts unique colors used

7. **`getCompressedGrid()` / `loadCompressedGrid()`**: Future IPFS
   - Converts grid to Base64 for storage
   - [FUTURE]: Upload to IPFS every 10 minutes

**Memory Usage**:
- 1000 x 1000 x 7 bytes (hex color) ≈ 7 MB in memory

**How to Modify**:
- Change canvas size: Update `CANVAS_WIDTH/HEIGHT` in constants
- Add persistence: Replace memory storage with database (PostgreSQL/MongoDB)
- Add IPFS: Implement periodic snapshots in `getCompressedGrid()`

---

### 📁 `server/src/userManager.js`

**Purpose**: Tracks user balances and rate limiting

**Data Structure**:
```javascript
this.users = Map {
  'erd1abc...': {
    address: 'erd1abc...',
    egld: 100,
    credits: 12000,
    paintHistory: [
      { timestamp: 1234567890, x: 500, y: 500, color: '#FF0000' },
      // ... last 100 paints
    ],
    createdAt: Date
  }
}
```
- Uses JavaScript `Map` for O(1) lookup
- Stored in RAM (volatile)

**Key Methods**:
1. **`createUser(address)`**: Initialize new user
   - Sets `egld: 100`, `credits: 0`
   - Returns user object

2. **`getUser(address)`**: Retrieve user data
   - Returns user object or null

3. **`purchaseCredits(address, cost, credits)`**: Process purchase
   - Checks if user has enough EGLD
   - Deducts EGLD, adds credits
   - Returns `{ success, egld, credits, message }`

4. **`deductCredits(address, amount)`**: Remove credits
   - Used when painting pixels
   - Returns `{ success, credits, message }`

5. **`recordPaint(address, x, y, color)`**: Add to history
   - Stores timestamp and coordinates
   - Keeps only last 100 paints (memory optimization)

6. **`isRateLimited(address)`**: Anti-spam check
   - Counts paints in last 1 second
   - Returns true if ≥ 10 pixels/sec
   - Prevents bot abuse

7. **`getUserStats(address)`**: Get user analytics
   - Total painted, balances, join date

**How to Modify**:
- Change initial balance: Edit `INITIAL_EGLD` in constants
- Change rate limit: Edit `MAX_PIXELS_PER_SECOND`
- Add persistence: Store users in database
- Add authentication: Verify wallet signatures

---

### 📁 `server/src/server.js` ⭐ MAIN SERVER FILE

**Purpose**: HTTP server + Socket.io event handling

**Structure**:
```javascript
1-9:    Imports
10-26:  Express + CORS + Socket.io setup
28:     PORT = 5001 (was 5000, changed due to conflict)
35-39:  generateMockWalletAddress() - Creates random erd1...
45-47:  simulateTransactionDelay() - 2 second Promise
49-257: Socket.io event handlers
259-267: Health check endpoint
269-285: Server startup
```

**Socket.io Events - Detailed Breakdown**:

#### 1. **`wallet:connect`** (Lines 60-86)
**Flow**:
```
Client emits: wallet:connect
Server receives → generates erd1... address
Server creates user (100 EGLD, 0 credits)
Server loads canvas grid
Server emits: wallet:connected { address, egld, credits, gridState }
```

**Mock Wallet Generation**:
```javascript
crypto.randomBytes(31) → 31 bytes
.toString('hex') → 62 hex characters
'erd1' + hex → erd1abc...xyz (66 chars total)
```
- Mimics MultiversX bech32 format
- [FUTURE]: Replace with real wallet authentication

#### 2. **`credits:purchase`** (Lines 96-145)
**Flow**:
```
Client emits: credits:purchase { tierName: 'Artisan' }
Server validates: tier exists, user has EGLD
Server simulates 2-second blockchain delay
Server calls: userManager.purchaseCredits()
Server emits: credits:purchased { newEgld, newCredits }
```

**Transaction Simulation**:
```javascript
await simulateTransactionDelay(); // setTimeout(2000)
```
- Mimics blockchain confirmation time
- [FUTURE]: Real transaction via MultiversX SDK

**Revenue Split** (Not implemented yet):
- [FUTURE]: 50% → Charity
- [FUTURE]: 25% → Token burn
- [FUTURE]: 25% → Treasury

#### 3. **`pixel:paint`** (Lines 154-211) ⭐ MOST CRITICAL
**Flow**:
```
Client emits: pixel:paint { x: 500, y: 500, color: '#FF0000' }
Server validates:
  1. Wallet connected?
  2. Rate limited? (max 10/sec)
  3. Valid coordinates? (0-999)
  4. Valid color? (#RRGGBB)
  5. Has credits? (≥1)
Server updates: pixelGrid.setPixel(x, y, color)
Server deducts: 1 credit from user
Server records: paint action in history
Server broadcasts: pixel:update to ALL clients
Server emits: credits:updated to painter
```

**Broadcast vs Emit**:
```javascript
io.emit('pixel:update', data);     // To ALL clients
socket.emit('credits:updated', data); // Only to sender
```

**Rate Limiting Logic** (Lines 164-169):
- Check: Count paints in last 1000ms
- If ≥ 10 → Reject with error
- Prevents spam/bots

#### 4. **`canvas:request`** (Lines 218-226)
- Used when client reconnects or loads page
- Sends full 1000x1000 grid (7MB)
- [FUTURE]: Send only changed pixels (delta updates)

#### 5. **`stats:request`** (Lines 232-246)
- Returns canvas stats (painted pixels, unique colors)
- Returns user stats (total painted, join date)
- Used for leaderboards/analytics

**Health Check Endpoint** (Lines 260-267):
```javascript
GET /health → { status, timestamp, users, gridStats }
```
- Used for monitoring/load balancing

**How to Modify Server**:
- Add new event: Add `socket.on('event:name', handler)` block
- Change port: Edit line 28 (update client too!)
- Add authentication: Verify signatures in event handlers
- Add database: Replace in-memory storage with DB calls

---

## Frontend (Client) - File by File

### 📁 `client/src/App.jsx`

**Purpose**: Root component with routing

**Structure**:
```jsx
<Router>
  <AppProvider>          {/* Global state */}
    <SocketProvider>     {/* Socket.io connection */}
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/canvas" element={<CanvasPage />} />
      </Routes>
    </SocketProvider>
  </AppProvider>
</Router>
```

**Provider Order Matters**:
1. `AppProvider` → Must wrap `SocketProvider` (socket needs app context)
2. `SocketProvider` → Must wrap pages (pages need socket methods)

**Route Protection**:
- `/shop` and `/canvas` check `wallet.isConnected`
- Redirect to `/login` if not connected (in page's `useEffect`)

**How to Modify**:
- Add new page: Add `<Route path="/new" element={<NewPage />} />`
- Change default page: Edit `path="/"` route

---

### 📁 `client/src/context/AppContext.jsx`

**Purpose**: Global state management (React Context API)

**State Variables**:
```javascript
wallet: {
  address: 'erd1...',
  isConnected: true,
  egld: 100,
  credits: 12000
}
gridState: [[color, ...], ...] // 1000x1000 array
selectedColor: '#FF0000'        // Current paint color
colorHistory: ['#FF0000', ...]  // Last 5 colors
toast: { message, type }        // Notification
isLoading: false                // Global loading state
```

**Key Methods**:

1. **`connectWallet(address, egld, credits, grid)`**
   - Sets wallet state
   - Loads grid from server
   - Shows success toast

2. **`updateBalances(egld, credits)`**
   - Updates after purchase or paint

3. **`changeColor(color)`**
   - Sets selected color
   - Adds to history (max 5)
   - Saves to localStorage

4. **`updatePixel(x, y, color)`**
   - Updates single pixel in grid (real-time)
   - Creates new array (immutability)
   ```javascript
   newGrid[y] = [...newGrid[y]];
   newGrid[y][x] = color;
   ```

5. **`showToast(message, type)`**
   - Displays notification (3 second auto-dismiss)
   - Types: 'success', 'error', 'info'

**localStorage Persistence**:
- Saves `selectedColor` and `colorHistory`
- Restores on page refresh
- Keeps user's color preferences

**How to Use in Components**:
```javascript
import { useApp } from '../context/AppContext';

function MyComponent() {
  const { wallet, selectedColor, changeColor, showToast } = useApp();

  return <button onClick={() => changeColor('#FF0000')}>
    Select Red
  </button>;
}
```

---

### 📁 `client/src/hooks/useSocket.jsx` ⭐ CRITICAL

**Purpose**: Socket.io connection management

**Connection Setup** (Lines 36-43):
```javascript
const socketInstance = io('http://localhost:5001', {
  transports: ['websocket', 'polling'],  // Try WebSocket first
  reconnection: true,                    // Auto-reconnect
  reconnectionDelay: 1000,               // Wait 1s before retry
  reconnectionAttempts: 5                // Max 5 retries
});
```

**Why Port 5001?**
- Originally 5000, but macOS AirPlay uses that port
- Changed in 3 places: server.js, useSocket.jsx, vite.config.js

**Event Listeners** (Lines 46-89):

1. **`connect`**: Socket connected successfully
2. **`disconnect`**: Connection lost (show warning)
3. **`connect_error`**: Failed to connect (check server)
4. **`pixel:update`**: Someone else painted
   - Calls `updatePixel(x, y, color)` from AppContext
   - Updates local grid instantly (no lag!)
5. **`canvas:init`**: Full canvas loaded
   - Sets entire grid state
6. **`credits:updated`**: Your credits changed (after painting)
7. **`credits:purchased`**: Purchase successful
   - Shows toast with tier name and credits
8. **`error`**: Server error message

**Provided Methods**:

1. **`purchaseCredits(tierName)`**
   ```javascript
   socket.emit('credits:purchase', { tierName: 'Artisan' });
   ```

2. **`paintPixel(x, y, color)`**
   ```javascript
   socket.emit('pixel:paint', { x: 500, y: 500, color: '#FF0000' });
   ```

3. **`requestCanvas()`**: Fetch full grid (on reconnect)
4. **`requestStats()`**: Get analytics

**Why `.jsx` Extension?**
- Contains JSX: `<SocketContext.Provider>`
- Vite requires `.jsx` for JSX syntax
- Originally `.js` → caused build error

---

### 📁 `client/src/hooks/useMockWallet.js`

**Purpose**: Mock wallet connection logic

**Flow**:
```
1. User clicks "Connect Wallet"
2. Call connectWallet()
3. Emit socket: wallet:connect
4. Wait for response (10 second timeout)
5. Receive: wallet:connected { address, egld, credits, gridState }
6. Update AppContext
7. Navigate to /shop
```

**Why Mock?**
- Phase 1 prototype (no blockchain yet)
- Server generates random erd1... addresses
- [FUTURE]: Replace with `@multiversx/sdk-dapp`

**Future Implementation** (Comments in file):
```javascript
import { useGetAccountInfo, useGetLoginInfo } from '@multiversx/sdk-dapp/hooks';

export const useWallet = () => {
  const { address, balance } = useGetAccountInfo();
  const { isLoggedIn } = useGetLoginInfo();
  return { address, balance, isConnected: isLoggedIn };
};
```

**Helper Methods**:
- `getTruncatedAddress()`: `erd1abc...xyz` (for UI)
- `getWallet()`: Returns full wallet object

---

### 📁 `client/src/hooks/useCanvas.js`

**Purpose**: Canvas interaction logic (zoom, pan, paint)

**State**:
```javascript
zoom: 1-20              // Zoom level
offset: { x: 0, y: 0 } // Camera position
isPanning: false        // Drag mode active?
hoverPixel: { x, y }    // Cursor position
```

**Key Methods**:

1. **`handleWheel(e)`**: Zoom in/out
   ```javascript
   deltaY > 0 ? zoom -= 0.5 : zoom += 0.5
   Clamp: Math.max(1, Math.min(20, zoom))
   ```

2. **`handleMouseDown(e)`**: Start panning
   - Middle or right mouse button
   - Records start position

3. **`handleMouseMove(e)`**: Pan or hover
   - If panning: Update offset
   - Else: Calculate hover pixel coordinates

4. **`handleClick(e)`**: Paint pixel
   - Left click only
   - Validates: wallet connected, credits > 0
   - Calculates pixel coordinates:
   ```javascript
   x = floor((mouseX - rect.left - offset.x) / zoom)
   y = floor((mouseY - rect.top - offset.y) / zoom)
   ```
   - Calls `paintPixel(x, y, selectedColor)`

5. **`zoomIn()` / `zoomOut()`**: Zoom buttons
6. **`resetView()`**: Reset to zoom 1, center canvas
7. **`getVisibleArea()`**: Optimization
   - Calculates which pixels are on screen
   - Only renders visible pixels (not all 1M!)
   ```javascript
   startX = max(0, floor(-offset.x / zoom))
   endX = min(1000, ceil((width - offset.x) / zoom))
   ```

**Grid Display**:
- `shouldShowGrid`: true when zoom ≥ 5
- Draws cyan grid lines between pixels

**Coordinate Math**:
```
Screen Space → Canvas Space
mouseX → (mouseX - offset.x) / zoom
mouseY → (mouseY - offset.y) / zoom
```

---

### 📁 `client/src/components/Canvas.jsx`

**Purpose**: Renders the 1000x1000 pixel canvas

**Rendering Process** (Lines 39-103):

1. **Setup Canvas**:
   ```javascript
   canvas.width = rect.width;   // Match container size
   canvas.height = rect.height;
   ctx.clearRect(0, 0, width, height); // Clear
   ```

2. **Apply Transform**:
   ```javascript
   ctx.translate(offset.x, offset.y); // Pan
   ctx.scale(zoom, zoom);              // Zoom
   ```

3. **Render Pixels** (Optimized):
   ```javascript
   for (y = startY; y < endY; y++) {
     for (x = startX; x < endX; x++) {
       color = gridState[y][x];
       ctx.fillStyle = color;
       ctx.fillRect(x, y, 1, 1); // 1x1 pixel square
     }
   }
   ```
   - Only renders visible area (500x500 at zoom 1)
   - At zoom 1: ~250,000 pixels rendered
   - At zoom 20: ~2,500 pixels rendered

4. **Draw Grid** (if zoom ≥ 5):
   ```javascript
   for (x = startX; x <= endX; x++) {
     drawLine(x, startY, x, endY);
   }
   ```

5. **Highlight Hover Pixel**:
   ```javascript
   ctx.strokeRect(hoverPixel.x, hoverPixel.y, 1, 1);
   ```

**Event Handlers**:
- `onWheel`: Zoom (calls `useCanvas.handleWheel`)
- `onMouseDown`: Start pan
- `onMouseMove`: Pan or hover
- `onMouseUp`: Stop pan
- `onClick`: Paint pixel
- `onContextMenu`: Disabled (right-click pans)

**Overlays**:
- Top-left: Hover coordinates `(500, 500)`
- Top-right: Zoom level `5.2x`
- Bottom-left: Instructions
- Center (if loading): Loading spinner

**CSS**:
```css
style={{ imageRendering: 'pixelated' }}
```
- Prevents anti-aliasing
- Keeps pixels sharp at high zoom

---

### 📁 `client/src/components/ColorPicker.jsx`

**Purpose**: Color selection UI

**Features**:

1. **Current Color Display** (Lines 92-103):
   - Large 64x64 swatch
   - Shows hex code (`#FF0000`)
   - Neon cyan glow

2. **Color History** (Lines 106-125):
   - Last 5 used colors
   - Horizontal row of 32x32 swatches
   - Click to reselect

3. **Preset Colors Grid** (Lines 128-145):
   - 30 colors in 5x6 grid
   - 40x40 swatches
   - Categories: Basic, Primary, Secondary, Neon, Pastels, Dark
   - Selected color has:
     - `border-primary` (cyan border)
     - `shadow-neon-cyan` (glow)
     - `ring-2 ring-primary` (extra ring)

4. **Custom Hex Input** (Lines 148-166):
   - Text input: `#FF0000`
   - Validates: `/^#[0-9A-Fa-f]{6}$/`
   - "Add" button
   - Adds to history on submit

**Preset Colors Array** (Lines 15-57):
```javascript
const PRESET_COLORS = [
  '#FFFFFF', // White
  '#000000', // Black
  '#FF0000', // Red
  // ... 27 more
];
```

**How to Add Colors**:
1. Add hex code to `PRESET_COLORS` array
2. Adjust grid: `grid-cols-5` → `grid-cols-6` (if needed)

---

### 📁 `client/src/pages/WelcomePage.jsx`

**Purpose**: Landing page

**Sections**:

1. **Hero** (Lines 18-53):
   - Animated emoji logo (🎨)
   - Title: "PIXEL CANVASCHAIN"
     - "PIXEL" in cyan with text-shadow
     - "CANVASCHAIN" in magenta with text-shadow
   - Subtitle with project description
   - CTA button: "Enter the Canvas" → `/login`
     - `animate-pulse-glow` class (TailwindCSS)
     - Neon cyan shadow
     - Hover: magenta shadow

2. **Feature Cards** (Lines 56-89):
   - 3 cards in grid
   - Card 1: "1000x1000 Canvas"
   - Card 2: "Real-time Painting"
   - Card 3: "50% to Charity"
   - Hover effects: border glow, shadow

3. **Footer** (Lines 92-99):
   - "Phase 1: Prototype (Mock Wallet)"
   - Powered by MultiversX

**Animations**:
- `animate-pulse-glow`: Pulsing opacity (defined in tailwind.config.js)
- `hover:shadow-neon-magenta`: Glow on hover

---

### 📁 `client/src/pages/LoginPage.jsx`

**Purpose**: Wallet connection page

**Flow**:
1. Show centered card
2. User clicks "Connect Mock Wallet"
3. Loading spinner (2 seconds)
4. Success checkmark
5. Auto-navigate to `/shop`

**Button States**:
- Normal: "Connect Mock Wallet"
- Loading: Spinner + "Connecting..."
- Success: Checkmark + "Connected!"

**Auto-navigation** (in useMockWallet.js):
```javascript
setTimeout(() => navigate('/shop'), 500);
```

**Future**:
- Replace button with `<ExtensionLogin>` component
- Add "Web Wallet" and "Ledger" options
- Show QR code for xPortal mobile

---

### 📁 `client/src/pages/ShopPage.jsx`

**Purpose**: Credit purchase page

**Protected Route** (Lines 77-81):
```javascript
useEffect(() => {
  if (!isConnected) navigate('/login');
}, [isConnected]);
```

**Layout**:

1. **Header** (Lines 96-118):
   - Title: "Purchase Credits"
   - "Start Painting" button (top-right)
     - Enabled if credits > 0
     - Green with pulse glow
     - Disabled: gray, locked icon

2. **Balance Display** (Lines 121-134):
   - Your Balance: **100** EGLD
   - Credits: **12,000**
   - In card with cyan border

3. **Tier Cards Grid** (Lines 138-142):
   - Maps over `TIERS` array
   - Renders `<ShopCard>` for each tier

4. **Info Cards** (Lines 145-175):
   - How it Works
   - 50% to Charity
   - Future: NFTs

**TIERS Array** (Lines 22-69):
- Duplicated from server constants
- [IMPROVEMENT]: Fetch from server API

---

### 📁 `client/src/components/ShopCard.jsx`

**Purpose**: Individual tier purchase card

**Props**:
```javascript
tier = {
  name: 'Artisan',
  cost: 100,
  basePixels: 10000,
  bonusPixels: 2000,
  total: 12000,
  bonusPercent: 20,
  color: '#a855f7',
  badge: 'Best Value' // Only for Legend
}
```

**Layout**:
- Tier name (colored header)
- Cost: "100 EGLD"
- Base pixels: "10,000"
- Bonus: "+2,000 (20%)" in green
- Total: "12,000 Credits" (bold)
- Badge (if Legend): "Best Value" in gradient
- Purchase button

**Purchase Button States**:
1. **Normal**: "Purchase" (cyan button)
2. **Loading**: Spinner (2 second delay)
3. **Success**: Checkmark + "Purchased!"
4. **Disabled**: Not enough EGLD (gray)

**Purchase Flow**:
```javascript
1. User clicks "Purchase"
2. setIsLoading(true)
3. Call purchaseCredits(tierName)
4. Socket emits: credits:purchase
5. Server waits 2 seconds
6. Server emits: credits:purchased
7. Toast shows: "Successfully purchased Artisan! +12,000 credits"
8. setIsLoading(false)
```

---

### 📁 `client/src/pages/CanvasPage.jsx`

**Purpose**: Main gameplay screen

**Layout**:
```
┌──────────────────────────────────────────────┐
│  Header (wallet info)                        │
├────────────┬─────────────────────┬───────────┤
│            │                     │           │
│ ColorPicker│      Canvas         │ Toolbar   │
│  (256px)   │   (flex-grow)       │  (256px)  │
│            │                     │           │
└────────────┴─────────────────────┴───────────┘
```

**Components**:
1. **Header**: Top bar with wallet info
2. **ColorPicker**: Left sidebar (30 colors)
3. **Canvas**: Center (1000x1000 pixels)
4. **Toolbar**: Right sidebar (zoom controls)

**Protected Route** (Lines 30-34):
```javascript
useEffect(() => {
  if (!wallet.isConnected) navigate('/login');
}, [wallet.isConnected]);
```

**Toast Notifications** (Lines 56-75):
```jsx
{toast && (
  <div className={`fixed top-4 right-4 ${colorClass}`}>
    {toast.message}
    <button onClick={dismissToast}>×</button>
  </div>
)}
```
- Types: success (green), error (red), info (blue)
- Auto-dismiss: 3 seconds
- Manual dismiss: X button

---

## Key Concepts Explained

### 1. Socket.io Real-time Communication

**Why Socket.io?**
- HTTP is request-response (one-way)
- WebSocket is bidirectional (two-way)
- Socket.io adds: auto-reconnection, fallback, rooms

**Connection**:
```javascript
Client: io('http://localhost:5001')
Server: io.on('connection', (socket) => { ... })
```

**Emitting Events**:
```javascript
// To server
socket.emit('event:name', { data });

// To client
socket.emit('event:name', { data }); // Only sender
io.emit('event:name', { data });     // All clients
```

**Listening to Events**:
```javascript
socket.on('event:name', (data) => {
  // Handle data
});
```

**Real-time Pixel Updates**:
- User A paints → Server broadcasts → User B sees instantly
- No polling, no delays, no page refresh

---

### 2. React Context API

**Why Context?**
- Avoid prop drilling (passing props through 10 components)
- Global state accessible anywhere

**Pattern**:
```javascript
// 1. Create context
const AppContext = createContext();

// 2. Create provider
export const AppProvider = ({ children }) => {
  const [state, setState] = useState();
  const value = { state, setState };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// 3. Create hook
export const useApp = () => useContext(AppContext);

// 4. Use in component
function MyComponent() {
  const { state, setState } = useApp();
  return <button onClick={() => setState('new')}>{state}</button>;
}
```

---

### 3. Canvas Rendering Optimization

**Problem**: Rendering 1,000,000 pixels = lag

**Solution**: Only render visible pixels
```javascript
// Calculate visible area
startX = max(0, floor(-offset.x / zoom));
endX = min(1000, ceil((width - offset.x) / zoom));

// Only render visible
for (y = startY; y < endY; y++) {
  for (x = startX; x < endX; x++) {
    renderPixel(x, y);
  }
}
```

**At zoom 1**:
- Visible: ~500x500 = 250,000 pixels
- Hidden: ~750,000 pixels (not rendered!)

**At zoom 20**:
- Visible: ~50x50 = 2,500 pixels
- Renders FASTER than low zoom!

---

### 4. Rate Limiting

**Problem**: User spams 1000 pixels/second → crashes server

**Solution**: Max 10 pixels/second
```javascript
// Get paints in last 1 second
const recentPaints = paintHistory.filter(
  paint => paint.timestamp > (Date.now() - 1000)
);

// If 10+ paints → reject
if (recentPaints.length >= 10) {
  socket.emit('error', { message: 'Rate limit exceeded' });
  return;
}
```

**Why 10/sec?**
- Fast enough for normal use
- Slow enough to prevent abuse
- [FUTURE]: Adjust based on tier (Legend = 20/sec?)

---

### 5. Mock Wallet Address Generation

**Current (Mock)**:
```javascript
crypto.randomBytes(31) // 31 bytes
  .toString('hex')      // 62 hex chars
'erd1' + hex            // erd1abc...xyz (66 chars)
```

**Future (Real)**:
```javascript
import { ExtensionProvider } from '@multiversx/sdk-dapp/providers';

const provider = ExtensionProvider.getInstance();
await provider.init();
const address = await provider.getAddress();
// Returns real erd1... from user's wallet extension
```

---

## How to Modify the Project

### Add a New Tier

**1. Server** (`server/src/constants.js`):
```javascript
export const TIERS = [
  // ... existing tiers
  {
    name: 'Supreme',
    cost: 2000,
    basePixels: 200000,
    bonusPixels: 150000,
    total: 350000,
    bonusPercent: 75,
    color: '#FF69B4',
    badge: 'Ultimate Value'
  }
];
```

**2. Client** (`client/src/pages/ShopPage.jsx`):
- Update `TIERS` array (or fetch from server API)

**3. Client** (`client/tailwind.config.js`):
- Add color: `supreme: '#FF69B4'`

---

### Change Canvas Size

**1. Constants** (`server/src/constants.js`):
```javascript
export const CANVAS_WIDTH = 2000;  // Was 1000
export const CANVAS_HEIGHT = 2000; // Was 1000
```

**2. Client** (`client/src/hooks/useCanvas.js`):
```javascript
const CANVAS_SIZE = 2000; // Was 1000
```

**3. Memory**: 2000x2000 = 4M pixels = 28 MB RAM

---

### Add Persistence (Database)

**Replace** (`server/src/pixelGrid.js`):
```javascript
// OLD: In-memory
this.grid = Array(1000).fill()...

// NEW: PostgreSQL
async setPixel(x, y, color) {
  await db.query(
    'UPDATE pixels SET color = $1 WHERE x = $2 AND y = $3',
    [color, x, y]
  );
}
```

**Add** (`server/src/userManager.js`):
```javascript
// OLD: Map
this.users = new Map();

// NEW: PostgreSQL
async getUser(address) {
  const result = await db.query(
    'SELECT * FROM users WHERE address = $1',
    [address]
  );
  return result.rows[0];
}
```

---

### Integrate Real Blockchain

**1. Install SDK**:
```bash
npm install @multiversx/sdk-dapp
```

**2. Replace** (`client/src/App.jsx`):
```jsx
import { DappProvider } from '@multiversx/sdk-dapp/wrappers';

<DappProvider environment="mainnet">
  {/* ... existing code ... */}
</DappProvider>
```

**3. Replace** (`client/src/pages/LoginPage.jsx`):
```jsx
import { ExtensionLoginButton } from '@multiversx/sdk-dapp/UI';

<ExtensionLoginButton
  callbackRoute="/shop"
  loginButtonText="Connect MultiversX Wallet"
/>
```

**4. Replace** (`client/src/hooks/useMockWallet.js`):
```javascript
import { useGetAccountInfo } from '@multiversx/sdk-dapp/hooks';

export const useWallet = () => {
  const { address, balance } = useGetAccountInfo();
  return { address, egld: balance };
};
```

**5. Server** (`server/src/server.js`):
- Remove mock wallet generation
- Add signature verification:
```javascript
const { UserVerifier } = require('@multiversx/sdk-core');
const verifier = new UserVerifier();
const valid = verifier.verify(message, signature, address);
```

---

## Common Issues & Solutions

### Issue: Port 5000 already in use

**Cause**: macOS AirPlay Receiver uses port 5000

**Solution**: Changed to port 5001 in 3 places:
1. `server/src/server.js` line 28
2. `client/src/hooks/useSocket.jsx` line 38
3. `client/vite.config.js` line 12

---

### Issue: "Failed to parse JSX syntax"

**Cause**: File has JSX but `.js` extension

**Solution**: Rename to `.jsx`:
- `useSocket.js` → `useSocket.jsx`

---

### Issue: Canvas performance lag

**Cause**: Rendering all 1M pixels every frame

**Solution**: Already optimized!
- `getVisibleArea()` calculates viewport
- Only renders visible pixels

**Further Optimization**:
- Use `OffscreenCanvas` for background rendering
- Implement dirty rectangle tracking
- Use WebGL for GPU acceleration

---

### Issue: Memory usage grows over time

**Cause**:
- Paint history stores ALL paints
- Grid state copied on every update

**Solution**:
- Limit paint history to 100 (already done)
- Use immutable data structures (Immer.js)
- Implement garbage collection

---

## File Structure Summary

```
Proiect Licenta/
├── server/                 # Backend (Node.js)
│   ├── src/
│   │   ├── server.js      # Main server (Socket.io events)
│   │   ├── constants.js   # Config (tiers, canvas size)
│   │   ├── pixelGrid.js   # 1000x1000 pixel storage
│   │   ├── userManager.js # User balances, rate limiting
│   │   └── blockchain/    # Future SDK integration
│   └── package.json       # Dependencies
│
├── client/                 # Frontend (React)
│   ├── src/
│   │   ├── App.jsx        # Router (4 routes)
│   │   ├── main.jsx       # Entry point
│   │   │
│   │   ├── context/
│   │   │   └── AppContext.jsx    # Global state
│   │   │
│   │   ├── hooks/
│   │   │   ├── useSocket.jsx     # Socket.io connection
│   │   │   ├── useMockWallet.js  # Mock wallet
│   │   │   └── useCanvas.js      # Canvas interactions
│   │   │
│   │   ├── pages/
│   │   │   ├── WelcomePage.jsx   # Landing (/)
│   │   │   ├── LoginPage.jsx     # Wallet (/login)
│   │   │   ├── ShopPage.jsx      # Purchase (/shop)
│   │   │   └── CanvasPage.jsx    # Gameplay (/canvas)
│   │   │
│   │   └── components/
│   │       ├── Header.jsx        # Nav bar
│   │       ├── WalletInfo.jsx    # Balance display
│   │       ├── ColorPicker.jsx   # 30 colors
│   │       ├── Canvas.jsx        # 1000x1000 renderer
│   │       ├── Toolbar.jsx       # Zoom controls
│   │       └── ShopCard.jsx      # Tier card
│   │
│   ├── index.html         # HTML entry
│   ├── vite.config.js     # Vite config (proxy)
│   └── tailwind.config.js # Theme colors
│
└── README.md              # Project docs
```

---

## Quick Reference: Where to Find Things

**Want to change tier prices?**
→ [server/src/constants.js](server/src/constants.js) line 16

**Want to change canvas size?**
→ [server/src/constants.js](server/src/constants.js) line 84-85

**Want to add new socket event?**
→ [server/src/server.js](server/src/server.js) add `socket.on('event:name', handler)`

**Want to add new page?**
→ Create component in `client/src/pages/`, add route in [App.jsx](client/src/App.jsx)

**Want to change colors?**
→ [client/tailwind.config.js](client/tailwind.config.js) lines 15-30

**Want to add new color to picker?**
→ [client/src/components/ColorPicker.jsx](client/src/components/ColorPicker.jsx) line 15-57

**Want to change rate limit?**
→ [server/src/constants.js](server/src/constants.js) line 90

**Want to change initial EGLD?**
→ [server/src/constants.js](server/src/constants.js) line 69

**Want to understand real-time painting?**
→ [server/src/server.js](server/src/server.js) line 154 + [client/src/hooks/useSocket.jsx](client/src/hooks/useSocket.jsx) line 62

---

## Running the Project

### Start Server:
```bash
cd server
npm start
```
Server runs on: http://localhost:5001

### Start Client:
```bash
cd client
npm run dev
```
Client runs on: http://localhost:5173

---

This documentation covers every file, every feature, and every design decision in your project. You should now understand the code as if you wrote it yourself!
