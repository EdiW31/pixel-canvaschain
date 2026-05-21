import 'dotenv/config';
import express from 'express';
import { renderCanvasPng } from './canvasPng.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pixelGrid from './pixelGrid.js';
import userManager from './userManager.js';

const API_URL = process.env.DEVNET_API_URL || 'https://devnet-api.multiversx.com';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

function decodeBase64BigUint(base64) {
  if (!base64) return BigInt(0);
  const buf = Buffer.from(base64, 'base64');
  let n = BigInt(0);
  for (const byte of buf) n = (n << BigInt(8)) | BigInt(byte);
  return n;
}

let _contractCache = null;
let _contractCacheAt = 0;

async function getContractStats() {
  const now = Date.now();
  if (_contractCache && now - _contractCacheAt < 15_000) return _contractCache;

  let currentEpoch = 0;
  let totalDonated = '0';

  if (CONTRACT_ADDRESS) {
    const query = async (funcName) => {
      const r = await fetch(`${API_URL}/vm-values/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scAddress: CONTRACT_ADDRESS, funcName, args: [] }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      return j?.data?.data?.returnData?.[0] ?? j?.data?.returnData?.[0] ?? j?.returnData?.[0] ?? null;
    };

    try { currentEpoch = Number(decodeBase64BigUint(await query('getCurrentEpoch'))); } catch (_) {}
    try { totalDonated = decodeBase64BigUint(await query('getTotalDonated')).toString(); } catch (_) {}
  }

  _contractCache = { currentEpoch, totalDonated };
  _contractCacheAt = now;
  return _contractCache;
}

async function collectStats() {
  const { paintedPixels, totalPixels } = pixelGrid.getStats();
  const contract = await getContractStats();
  return {
    onlineUsers: userManager.getUserCount(),
    totalPixels: paintedPixels,
    canvasSize: totalPixels,
    ...contract,
    lastUpdated: new Date().toISOString(),
  };
}

const app = express();
const httpServer = createServer(app);

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 5001;

io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);

  /**
   * wallet:join — register socket session and send canvas state.
   * No longer fetches on-chain credits; painting is free (pay later via PIXEL tx).
   */
  socket.on('wallet:join', async ({ address } = {}) => {
    try {
      if (!address || !address.startsWith('erd1')) {
        socket.emit('error', { message: 'Invalid wallet address' });
        return;
      }

      userManager.joinUser(address);
      socket.walletAddress = address;

      socket.emit('wallet:joined', {
        address,
        gridState: pixelGrid.getGrid(),
      });

      console.log(`💼 Wallet joined: ${address.slice(0, 10)}...`);
    } catch (error) {
      console.error('❌ wallet:join error:', error);
      socket.emit('error', { message: 'Failed to join with wallet' });
    }
  });

  /**
   * pixel:paint — validate and broadcast (no credit gate).
   */
  socket.on('pixel:paint', ({ x, y, color }) => {
    try {
      const address = socket.walletAddress;
      if (!address) {
        socket.emit('error', { message: 'Wallet not joined. Emit wallet:join first.' });
        return;
      }

      if (!pixelGrid.isValidCoordinate(x, y)) {
        socket.emit('error', { message: 'Invalid coordinates' });
        return;
      }
      if (!pixelGrid.isValidColor(color)) {
        socket.emit('error', { message: 'Invalid color format' });
        return;
      }

      if (!pixelGrid.setPixel(x, y, color, address)) {
        socket.emit('error', { message: 'Failed to update pixel' });
        return;
      }

      userManager.recordPaint(address, x, y, color);
      io.emit('pixel:update', { x, y, color, address });

      console.log(`🎨 Pixel painted: (${x}, ${y}) ${color} by ${address.slice(0, 10)}...`);
    } catch (error) {
      console.error('❌ Paint error:', error);
      socket.emit('error', { message: 'Failed to paint pixel' });
    }
  });

  /**
   * pixels:paint — batch paint (brush mode), no credit gate.
   */
  socket.on('pixels:paint', ({ pixels }) => {
    try {
      const address = socket.walletAddress;
      if (!address) {
        socket.emit('error', { message: 'Wallet not joined. Emit wallet:join first.' });
        return;
      }

      if (!Array.isArray(pixels) || pixels.length === 0) {
        socket.emit('error', { message: 'Invalid pixels data' });
        return;
      }

      if (pixels.length > 64) {
        socket.emit('error', { message: 'Too many pixels in single request (max 64)' });
        return;
      }

      for (const pixel of pixels) {
        if (!pixelGrid.isValidCoordinate(pixel.x, pixel.y)) {
          socket.emit('error', { message: `Invalid coordinates: (${pixel.x}, ${pixel.y})` });
          return;
        }
        if (!pixelGrid.isValidColor(pixel.color)) {
          socket.emit('error', { message: `Invalid color format: ${pixel.color}` });
          return;
        }
      }

      const paintedPixels = pixelGrid.setPixelsBatch(pixels, address);
      for (const p of paintedPixels) userManager.recordPaint(address, p.x, p.y, p.color);

      io.emit('pixels:update', { pixels: paintedPixels, address });

      console.log(`🎨 Batch painted: ${paintedPixels.length} pixels by ${address.slice(0, 10)}...`);
    } catch (error) {
      console.error('❌ Batch paint error:', error);
      socket.emit('error', { message: 'Failed to paint pixels' });
    }
  });

  /**
   * pixels:submit — client notifies us that a paintPixels ESDT tx was signed.
   * Acknowledges with pixels:committed so the client can clear its pending list.
   */
  socket.on('pixels:submit', ({ txHash } = {}) => {
    const address = socket.walletAddress;
    if (!address) return;
    console.log(`💰 PIXEL tx submitted by ${address.slice(0, 10)}...: ${txHash}`);
    // Optimistic acknowledgement — the contract handles actual ownership enforcement.
    socket.emit('pixels:committed', { txHash });
  });

  /**
   * pixels:confirm — client polled the explorer and confirmed the paintPixels
   * ESDT tx succeeded on-chain. THIS is the only path that writes pixels to
   * SQLite. Until this fires, painted pixels live only in volatile memory
   * and disappear on server restart.
   *
   * Idempotent: re-emitting the same payload is safe (upsert by x,y).
   */
  socket.on('pixels:confirm', ({ pixels, txHash } = {}) => {
    const address = socket.walletAddress;
    if (!address || !Array.isArray(pixels) || pixels.length === 0) return;
    const n = pixelGrid.persistPixels(pixels, address);
    if (n > 0) {
      console.log(`✅ Persisted ${n} pixels for ${address.slice(0, 10)}... (tx ${txHash ?? 'n/a'})`);
    }
  });

  /**
   * pixels:rollback — client polled the explorer and learned the paintPixels
   * tx failed (or timed out). Revert the optimistic pixels in MEMORY ONLY
   * and broadcast the reset so every connected client redraws. DB is not
   * touched because the failed pixels were never persisted in the first
   * place — touching DB here would risk wiping someone else's confirmed
   * pixel at the same coordinate.
   *
   * Devnet trust model: server does not re-verify the tx hash. The user has
   * no incentive to fake their own rollback.
   */
  socket.on('pixels:rollback', ({ pixels, txHash } = {}) => {
    const address = socket.walletAddress;
    if (!address || !Array.isArray(pixels) || pixels.length === 0) return;
    const reverted = pixelGrid.revertPixels(pixels);
    if (reverted.length === 0) return;
    console.log(`↩  Rolled back ${reverted.length} pixels for ${address.slice(0, 10)}... (tx ${txHash ?? 'n/a'})`);
    io.emit('pixels:update', { pixels: reverted, address: null });
  });

  /**
   * canvas:request — send current canvas state (reconnection).
   */
  socket.on('canvas:request', () => {
    try {
      socket.emit('canvas:init', { gridState: pixelGrid.getGrid() });
    } catch (error) {
      console.error('❌ Canvas request error:', error);
      socket.emit('error', { message: 'Failed to load canvas' });
    }
  });

  /**
   * stats:request
   */
  socket.on('stats:request', async () => {
    try {
      socket.emit('stats:data', await collectStats());
    } catch (error) {
      console.error('❌ Stats request error:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

app.get('/stats', async (req, res) => {
  try {
    res.json(await collectStats());
  } catch (err) {
    res.status(500).json({ error: 'Failed to collect stats' });
  }
});

app.get('/canvas/png', async (req, res) => {
  try {
    const buf = await renderCanvasPng(pixelGrid.getGrid());
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=60');
    res.send(buf);
  } catch (err) {
    console.error('PNG render error:', err);
    res.status(500).json({ error: 'Failed to render canvas PNG' });
  }
});

/**
 * POST /canvas/upload
 * Renders the current canvas as a PNG and uploads it to catbox.moe
 * (free permanent hosting, no auth required).
 * Returns { url: "https://files.catbox.moe/xxxxxx.png" }
 *
 * Called automatically by the admin client just before endEpoch so the
 * NFT URI points to a publicly accessible image on devnet.
 */
app.post('/canvas/upload', async (req, res) => {
  try {
    console.log('📤 Uploading canvas PNG to catbox.moe…');
    const buf = await renderCanvasPng(pixelGrid.getGrid());

    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append(
      'fileToUpload',
      new Blob([buf], { type: 'image/png' }),
      `canvas-${Date.now()}.png`,
    );

    const upload = await fetch('https://catbox.moe/user.php', {
      method: 'POST',
      body: formData,
    });

    if (!upload.ok) {
      throw new Error(`catbox.moe responded ${upload.status}`);
    }

    const url = (await upload.text()).trim();
    if (!url.startsWith('https://')) {
      throw new Error(`Unexpected response from catbox.moe: ${url}`);
    }

    console.log(`✅ Canvas uploaded: ${url}`);
    res.json({ url });
  } catch (err) {
    console.error('Canvas upload error:', err);
    res.status(500).json({ error: err.message ?? 'Upload failed' });
  }
});

app.get('/canvas/section-png', async (req, res) => {
  try {
    const x = parseInt(req.query.x ?? '0', 10);
    const y = parseInt(req.query.y ?? '0', 10);
    const w = parseInt(req.query.w ?? '100', 10);
    const h = parseInt(req.query.h ?? '100', 10);
    if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > 100 || y + h > 100) {
      return res.status(400).json({ error: 'Invalid section bounds' });
    }
    const buf = await renderCanvasPng(pixelGrid.getGrid(), { x, y, w, h });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=60');
    res.send(buf);
  } catch (err) {
    console.error('Section PNG render error:', err);
    res.status(500).json({ error: 'Failed to render section PNG' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    users: userManager.getUserCount(),
    gridStats: pixelGrid.getStats(),
  });
});

// Rehydrate the grid from SQLite before opening the port so the very first
// client connection sees the persisted canvas, not an empty grid.
pixelGrid.hydrateFromDb();

// Tracks the last on-chain epoch we observed. When it increments we wipe the
// canvas (memory + DB) and broadcast canvas:init with a blank grid so every
// connected client redraws — each epoch starts fresh.
let lastSeenEpoch = null;

async function pollEpochAndMaybeResetCanvas() {
  try {
    const { currentEpoch } = await getContractStats();
    if (lastSeenEpoch !== null && currentEpoch > lastSeenEpoch) {
      console.log(`🎬 Epoch ${lastSeenEpoch} → ${currentEpoch}: clearing canvas for all clients`);
      pixelGrid.clearAll();
      io.emit('canvas:init', { gridState: pixelGrid.getGrid() });
    }
    lastSeenEpoch = currentEpoch;
  } catch (err) {
    console.error('❌ Epoch poll error:', err?.message);
  }
}

httpServer.listen(PORT, () => {
  // Prime the epoch tracker once at boot so the very first poll after this
  // doesn't false-positive a reset.
  pollEpochAndMaybeResetCanvas();

  setInterval(async () => {
    try {
      io.emit('stats:data', await collectStats());
    } catch (err) {
      console.error('❌ Periodic stats broadcast error:', err);
    }
  }, 10_000);

  // Detect epoch increment ~every 30s.
  setInterval(pollEpochAndMaybeResetCanvas, 30_000);

  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║       🎨 Pixel CanvasChain Server - Phase 3 🎨          ║
║                                                          ║
║  Server running on: http://localhost:${PORT}              ║
║  Socket.io: Ready for connections                       ║
║  Canvas: ${String(pixelGrid.getStats().width).padEnd(3)}x${String(pixelGrid.getStats().height).padEnd(3)} pixels initialized         ║
║  Blockchain: PIXEL ESDT token (paint-then-pay)          ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
