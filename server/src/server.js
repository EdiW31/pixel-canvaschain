import 'dotenv/config';
import express from 'express';
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

      if (userManager.isRateLimited(address)) {
        socket.emit('error', { message: 'Rate limit exceeded. Max 10 pixels per second.' });
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

      if (!pixelGrid.setPixel(x, y, color)) {
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

      if (userManager.isRateLimited(address)) {
        socket.emit('error', { message: 'Rate limit exceeded. Max 10 pixels per second.' });
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

      const paintedPixels = [];
      for (const pixel of pixels) {
        if (pixelGrid.setPixel(pixel.x, pixel.y, pixel.color)) {
          paintedPixels.push(pixel);
          userManager.recordPaint(address, pixel.x, pixel.y, pixel.color);
        }
      }

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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    users: userManager.getUserCount(),
    gridStats: pixelGrid.getStats(),
  });
});

httpServer.listen(PORT, () => {
  setInterval(async () => {
    try {
      io.emit('stats:data', await collectStats());
    } catch (err) {
      console.error('❌ Periodic stats broadcast error:', err);
    }
  }, 10_000);

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
