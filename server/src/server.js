import 'dotenv/config';
import express from 'express';
import { renderCanvasPng } from './canvasPng.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelGrid from './pixelGrid.js';
import userManager from './userManager.js';
import { generatePainterArtifact } from './ai/painterAI.js';

// Surface async crashes with a stack trace instead of a silent exit.
process.on('unhandledRejection', (reason, p) => {
  console.error('🚨 Unhandled Rejection at:', p, '\n  reason:', reason?.stack ?? reason);
});
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err?.stack ?? err);
});

const API_URL = process.env.DEVNET_API_URL || 'https://devnet-api.multiversx.com';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

// Per-epoch snapshots of canvas + auction zone, captured at endEpoch. Immutable
// per epoch, survive canvas wipes, and back the NFT image on the website.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = path.resolve(__dirname, '../snapshots');
try {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  console.log(`📸 Snapshots dir: ${SNAPSHOTS_DIR}`);
} catch (e) {
  console.error('Failed to create snapshots dir:', e);
}

// Pending paintPixels txs awaiting on-chain confirmation, keyed by txHash:
// { address, pixels: [{x,y,color}], expiresAt }. The server polls devnet for
// each so pixel ownership stays server-authoritative even if the tab closes.
const pendingTxs = new Map();

// Devnet reports tx status with several spellings across API versions; anything
// unmatched falls through to "keep polling".
const TX_STATUS_SUCCESS = new Set(['success', 'successful', 'executed']);
const TX_STATUS_FAIL = new Set(['fail', 'failed', 'invalid', 'rejected']);

// Pull a human-readable SC revert reason out of a devnet tx payload, or null.
function extractRevertReason(data) {
  try {
    const scr = data?.smartContractResults;
    if (Array.isArray(scr)) {
      for (const r of scr) {
        if (r?.returnMessage) return r.returnMessage;
      }
    }
    const events = data?.logs?.events;
    if (Array.isArray(events)) {
      for (const ev of events) {
        if (ev?.identifier === 'signalError' || ev?.identifier === 'internalVMErrors') {
          const raw = ev?.data ? Buffer.from(ev.data, 'base64').toString('utf8') : '';
          const m = raw.match(/\[([^\]]+)\]/g);
          if (m && m.length) return m[m.length - 1].replace(/[[\]]/g, '');
          if (raw) return raw.slice(0, 120);
        }
      }
    }
  } catch (_) {}
  return null;
}

async function watchTxOnDevnet(io, txHash) {
  // 5-minute deadline: devnet can take >120s to reflect a tx, and we'd rather
  // hold pixels in memory than revert a paint the user actually paid for.
  const deadline = Date.now() + 300_000;
  let pollCount = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    const entry = pendingTxs.get(txHash);
    if (!entry) return; // resolved elsewhere (e.g. client-side pixels:confirm)
    pollCount++;
    try {
      const res = await fetch(`${API_URL}/transactions/${txHash}`);
      if (!res.ok) {
        if (pollCount === 1 || pollCount % 6 === 0) {
          console.warn(`[server-watch] tx ${txHash.slice(0, 10)}… fetch ${res.status} (poll #${pollCount})`);
        }
        continue;
      }
      const data = await res.json();
      const status = data?.status;
      if (pollCount === 1 || pollCount % 6 === 0) {
        console.log(`[server-watch] tx ${txHash.slice(0, 10)}… status="${status}" (poll #${pollCount})`);
      }
      if (TX_STATUS_SUCCESS.has(status)) {
        try {
          const n = pixelGrid.persistPixels(entry.pixels, entry.address);
          pendingTxs.delete(txHash);
          console.log(`✅ [server-watch] Persisted ${n} pixels (tx ${txHash})`);
        } catch (persistErr) {
          console.error('[server-watch] persist failed, will retry:', persistErr?.message ?? persistErr);
          continue;
        }
        return;
      }
      if (TX_STATUS_FAIL.has(status)) {
        // Pixels are already persisted at paint time and the DB is the display
        // source of truth, so we don't remove them here — only log the revert.
        pendingTxs.delete(txHash);
        const reason = extractRevertReason(data);
        console.warn(
          `⚠️  [server-watch] tx ${txHash} status=${status}` +
          (reason ? ` — reason: ${reason}` : '') +
          ' (pixels left in place; payment unconfirmed on-chain)',
        );
        return;
      }
    } catch (e) {
      console.warn('[watchTxOnDevnet] poll error:', e?.message ?? e);
    }
  }
  // On timeout, leave optimistic pixels in place rather than reverting a paint
  // that may simply be slow to settle; the DB-backed grid corrects on refresh.
  const entry = pendingTxs.get(txHash);
  if (entry) {
    pendingTxs.delete(txHash);
    console.warn(`⌛ [server-watch] Timeout after 5min for tx ${txHash} — leaving optimistic pixels in place, NOT reverting. Manually check devnet explorer.`);
  }
}

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

// Allow localhost dev, any private LAN IP (mobile testing), and explicit
// origins from CORS_ORIGINS.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  ...(process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
]);
const corsOrigin = (origin, cb) => {
  if (!origin) return cb(null, true); // curl / Postman / same-origin
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
  if (/^http:\/\/(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) return cb(null, true);
  if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
  cb(new Error(`CORS: origin not allowed — ${origin}`));
};

app.use(cors({ origin: corsOrigin, credentials: true }));

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 5001;

io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);

  // wallet:join — register socket session and send the confirmed canvas state.
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
        gridState: pixelGrid.getConfirmedGrid(),
      });

      console.log(`💼 Wallet joined: ${address.slice(0, 10)}...`);
    } catch (error) {
      console.error('❌ wallet:join error:', error);
      socket.emit('error', { message: 'Failed to join with wallet' });
    }
  });

  // pixel:paint — validate and broadcast a single pixel.
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

  // pixels:paint — batch paint (brush mode).
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

  // pixels:submit — client signed a paintPixels ESDT tx. We ack so its pending
  // UI clears, and start watching devnet when a hash + pixels are present.
  socket.on('pixels:submit', ({ txHash, pixels } = {}) => {
    const address = socket.walletAddress;
    if (!address) return;
    // txHash MAY be empty: some wallets return a signed tx with no hash. We
    // still ack; the devnet watcher only runs when we have both hash and pixels.
    if (txHash) {
      console.log(`💰 PIXEL tx submitted by ${address.slice(0, 10)}...: ${txHash}`);
    } else {
      console.log(`💰 PIXEL tx submitted by ${address.slice(0, 10)}... (no hash — wallet returned empty)`);
    }

    if (txHash && Array.isArray(pixels) && pixels.length > 0) {
      const sanitized = pixels
        .filter((p) => pixelGrid.isValidCoordinate(p.x, p.y) && pixelGrid.isValidColor(p.color))
        .map((p) => ({ x: p.x, y: p.y, color: p.color }));
      if (sanitized.length > 0 && !pendingTxs.has(txHash)) {
        pendingTxs.set(txHash, {
          address,
          pixels: sanitized,
          expiresAt: Date.now() + 120_000,
        });
        // Fire-and-forget watcher; if it rejects unexpectedly, force a rollback
        // so pixels can't ghost forever in pendingTxs.
        watchTxOnDevnet(io, txHash).catch((e) => {
          console.error('[watchTxOnDevnet] rejected unexpectedly:', e?.message ?? e);
          const stranded = pendingTxs.get(txHash);
          if (stranded) {
            const reverted = pixelGrid.revertPixels(stranded.pixels);
            pendingTxs.delete(txHash);
            io.emit('pixels:update', { pixels: reverted, address: null });
            console.log(`↩  [watcher-reject-rollback] Reverted ${reverted.length} pixels (tx ${txHash})`);
          }
        });
      }
    }

    socket.emit('pixels:committed', { txHash: txHash ?? '' });
  });

  // pixels:confirm — client verified the paintPixels tx succeeded on-chain.
  // This is the only path that writes pixels to SQLite. Idempotent (upsert).
  socket.on('pixels:confirm', ({ pixels, txHash } = {}) => {
    const address = socket.walletAddress;
    if (!address || !Array.isArray(pixels) || pixels.length === 0) {
      console.warn(`[pixels:confirm] rejected — addr=${!!address} pixels=${Array.isArray(pixels) ? pixels.length : 'n/a'}`);
      return;
    }
    // A colorless payload means the client regressed the Toolbar fix that passes
    // full pixels here; log loudly instead of silently filtering.
    const colorlessCount = pixels.filter((p) => !p || typeof p.color !== 'string').length;
    if (colorlessCount > 0) {
      console.warn(
        `[pixels:confirm] ${colorlessCount}/${pixels.length} pixels missing color — client bug; will be skipped by persistPixels`,
      );
    }
    try {
      const n = pixelGrid.persistPixels(pixels, address);
      if (n > 0) {
        console.log(`✅ Persisted ${n} pixels for ${address.slice(0, 10)}... (tx ${txHash ?? 'n/a'})`);
        if (txHash) pendingTxs.delete(txHash);
      } else {
        console.warn(`[pixels:confirm] persistPixels returned 0 for ${pixels.length} input pixels (tx ${txHash ?? 'n/a'})`);
      }
    } catch (e) {
      console.error('[pixels:confirm] persist failed:', e?.message ?? e);
      socket.emit('error', { message: 'Failed to persist confirmed pixels' });
    }
  });

  // pixels:rollback — client learned the tx failed/timed out. Revert the
  // optimistic pixels in MEMORY ONLY (they were never persisted) and broadcast.
  socket.on('pixels:rollback', ({ pixels, txHash } = {}) => {
    const address = socket.walletAddress;
    if (!address || !Array.isArray(pixels) || pixels.length === 0) return;
    const reverted = pixelGrid.revertPixels(pixels);
    if (reverted.length === 0) return;
    console.log(`↩  Rolled back ${reverted.length} pixels for ${address.slice(0, 10)}... (tx ${txHash ?? 'n/a'})`);
    io.emit('pixels:update', { pixels: reverted, address: null });
  });

  // canvas:request — resend confirmed canvas state on reconnect.
  socket.on('canvas:request', () => {
    try {
      socket.emit('canvas:init', { gridState: pixelGrid.getConfirmedGrid() });
    } catch (error) {
      console.error('❌ Canvas request error:', error);
      socket.emit('error', { message: 'Failed to load canvas' });
    }
  });

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
 * POST /snapshots/epoch/:n  — body: { sx, sy, w?, h?, scale? }
 * Writes immutable canvas + zone PNGs for epoch N and returns their URLs.
 * Called by AdminPage.handleEndEpoch; snapshots survive canvas wipes so the
 * NFT gallery can always render the canvas as it was at that epoch's end.
 */
app.post('/snapshots/epoch/:n', express.json(), async (req, res) => {
  try {
    const n = parseInt(req.params.n, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: 'Invalid epoch number' });
    }
    const sx    = Number(req.body?.sx ?? 0);
    const sy    = Number(req.body?.sy ?? 0);
    const w     = Number(req.body?.w ?? 20);
    const h     = Number(req.body?.h ?? 20);
    const scale = Number(req.body?.scale ?? 32);
    if (sx < 0 || sy < 0 || sx + w > 100 || sy + h > 100) {
      return res.status(400).json({ error: 'Invalid zone bounds' });
    }

    // Render from the CONFIRMED grid only (pixels paid for on-chain). Optimistic
    // socket-paint pixels must never bleed into the NFT artwork for this epoch.
    const grid = pixelGrid.getConfirmedGrid();
    const [canvasBuf, zoneBuf] = await Promise.all([
      renderCanvasPng(grid),
      renderCanvasPng(grid, { x: sx, y: sy, w, h, scale }),
    ]);

    const canvasPath = path.join(SNAPSHOTS_DIR, `epoch-${n}-canvas.png`);
    const zonePath   = path.join(SNAPSHOTS_DIR, `epoch-${n}-zone.png`);
    fs.writeFileSync(canvasPath, canvasBuf);
    fs.writeFileSync(zonePath, zoneBuf);
    console.log(`📸 Snapshot written for epoch ${n}: ${canvasBuf.length}B canvas, ${zoneBuf.length}B zone`);

    // Co-creation AI: fire-and-forget so the admin's endEpoch tx isn't blocked
    // on a long OpenAI round-trip. The GET handler falls back to canvas.png
    // until ai.png lands, then swaps it in with no on-chain change.
    generatePainterArtifact(n, SNAPSHOTS_DIR).catch((err) => {
      console.error(`[painterAI] unhandled error for epoch ${n}:`, err?.message ?? err);
    });

    res.json({
      canvasUrl: `/snapshots/epoch/${n}/canvas.png`,
      zoneUrl:   `/snapshots/epoch/${n}/zone.png`,
      aiUrl:     `/snapshots/epoch/${n}/ai.png`,
    });
  } catch (err) {
    console.error('Snapshot write error:', err);
    res.status(500).json({ error: err.message ?? 'Snapshot failed' });
  }
});

/**
 * GET /snapshots/epoch/:n/:kind.png — serves the immutable snapshot PNGs.
 * `painter` is a legacy alias for `ai`. While ai.png is still being generated
 * (or if it failed), falls back to canvas.png so the NFT image is never broken.
 */
app.get('/snapshots/epoch/:n/:kind.png', (req, res) => {
  try {
    const n = parseInt(req.params.n, 10);
    const kind = req.params.kind;
    if (!Number.isFinite(n) || n <= 0 || !['canvas', 'zone', 'ai', 'painter'].includes(kind)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    const diskKind = kind === 'painter' ? 'ai' : kind;
    let filePath = path.join(SNAPSHOTS_DIR, `epoch-${n}-${diskKind}.png`);

    if (diskKind === 'ai' && !fs.existsSync(filePath)) {
      const fallback = path.join(SNAPSHOTS_DIR, `epoch-${n}-canvas.png`);
      if (fs.existsSync(fallback)) {
        res.set('Cache-Control', 'no-cache');
        res.set('Content-Type', 'image/png');
        return res.sendFile(fallback);
      }
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `No ${kind} snapshot for epoch ${n}` });
    }
    res.set('Content-Type', 'image/png');
    // canvas + zone are immutable per epoch; ai.png only once it's been written.
    res.set('Cache-Control',
      diskKind === 'ai'
        ? 'public, max-age=300'
        : 'public, max-age=31536000, immutable');
    res.sendFile(filePath);
  } catch (err) {
    console.error('Snapshot serve error:', err);
    res.status(500).json({ error: 'Failed to serve snapshot' });
  }
});

/**
 * GET /snapshots/epoch/:n/ai-status — { ready, captionReady } so the NFT card
 * can show a "waiting for AI generation" placeholder. No-store cache.
 */
app.get('/snapshots/epoch/:n/ai-status', (req, res) => {
  try {
    const n = parseInt(req.params.n, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: 'Invalid epoch' });
    }
    const imgPath = path.join(SNAPSHOTS_DIR, `epoch-${n}-ai.png`);
    const capPath = path.join(SNAPSHOTS_DIR, `epoch-${n}-caption.txt`);
    res.set('Cache-Control', 'no-store');
    res.json({
      ready: fs.existsSync(imgPath),
      captionReady: fs.existsSync(capPath),
    });
  } catch (err) {
    console.error('ai-status error:', err);
    res.status(500).json({ error: 'Failed to check AI status' });
  }
});

// GET /snapshots/epoch/:n/caption.txt — the AI caption for the painter NFT.
app.get('/snapshots/epoch/:n/caption.txt', (req, res) => {
  try {
    const n = parseInt(req.params.n, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: 'Invalid epoch' });
    }
    const filePath = path.join(SNAPSHOTS_DIR, `epoch-${n}-caption.txt`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `No AI caption for epoch ${n}` });
    }
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.sendFile(filePath);
  } catch (err) {
    console.error('Caption serve error:', err);
    res.status(500).json({ error: 'Failed to serve caption' });
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

// Rehydrate the grid from SQLite before opening the port. If the DB is
// unreadable, fail loud rather than start with a blank canvas that clients
// would then overwrite.
try {
  pixelGrid.hydrateFromDb();
} catch (e) {
  console.error('💥 hydrateFromDb FAILED — refusing to start with empty grid:', e?.message ?? e);
  process.exit(1);
}

// When the on-chain epoch increments we wipe the canvas (memory + DB) and
// broadcast a blank grid so every client redraws — each epoch starts fresh.
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
  // Prime the epoch tracker so the first scheduled poll doesn't false-positive.
  pollEpochAndMaybeResetCanvas();

  setInterval(async () => {
    try {
      io.emit('stats:data', await collectStats());
    } catch (err) {
      console.error('❌ Periodic stats broadcast error:', err);
    }
  }, 10_000);

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
