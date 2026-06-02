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

// ── Surface crashes loudly ──────────────────────────────────────────────────
// Previously, an unhandled rejection in any async handler (upload, DB write,
// devnet fetch) could exit the process silently. With these listeners we get
// a stack trace BEFORE the process dies — turning "server just stopped" into
// "server died because X."
process.on('unhandledRejection', (reason, p) => {
  console.error('🚨 Unhandled Rejection at:', p, '\n  reason:', reason?.stack ?? reason);
});
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err?.stack ?? err);
});

const API_URL = process.env.DEVNET_API_URL || 'https://devnet-api.multiversx.com';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

// Per-epoch snapshot directory — captures canvas + auction zone as they were
// at endEpoch time. These files are immutable per epoch, survive canvas
// wipes, and back the NFT image both on the website (served from /snapshots)
// and as a fallback when the public-host upload fails.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = path.resolve(__dirname, '../snapshots');
try {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  console.log(`📸 Snapshots dir: ${SNAPSHOTS_DIR}`);
} catch (e) {
  console.error('Failed to create snapshots dir:', e);
}

/**
 * Pending paintPixels transactions awaiting on-chain confirmation.
 *   key:   txHash
 *   value: { address, pixels: [{x,y,color}], expiresAt }
 *
 * On `pixels:submit` the server starts polling devnet for the tx outcome.
 * Success → persist the pixels to SQLite (so they survive refresh).
 * Failure/timeout → revert in memory + broadcast the rollback to all clients.
 *
 * This makes pixel ownership server-authoritative: even if the user closes
 * the tab right after signing, ghost pixels can't survive.
 */
const pendingTxs = new Map();

// Status strings reported by the MultiversX devnet API. We accept multiple
// success/fail spellings because the API has historically alternated between
// them across versions. Anything not matched falls through to "keep polling".
const TX_STATUS_SUCCESS = new Set(['success', 'successful', 'executed']);
const TX_STATUS_FAIL = new Set(['fail', 'failed', 'invalid', 'rejected']);

/**
 * Pull a human-readable SC revert reason out of a devnet transaction payload.
 * Checks `smartContractResults[].returnMessage` then `logs.events` (signalError
 * / internalVMErrors, base64-encoded). Returns null if nothing useful is found.
 */
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
  } catch (_) { /* best-effort only */ }
  return null;
}

async function watchTxOnDevnet(io, txHash) {
  // 5-minute deadline (was 2). Devnet occasionally takes longer than 120s to
  // reflect a successful tx; we'd rather hold pixels in-memory than revert
  // a paint the user actually paid for.
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
      // Log every status value at least once so unexpected spellings show up
      // in logs instead of silently being treated as "pending".
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
        // Pixels were already persisted at paint time (socket paint → SQLite),
        // so we do NOT remove them here — the canvas/DB is the display source of
        // truth and the contract independently enforces token payment on-chain.
        // We just log the on-chain revert reason for diagnosis.
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
  // Timeout. Previously we auto-reverted, which destroyed pixels the user
  // had actually paid for if devnet was just slow. Now we leave the in-memory
  // pixels alone and just log loudly — the user can refresh and the
  // confirmedGrid (DB-backed) will tell the truth once the tx eventually
  // settles via the client-side watchPaintTx → pixels:confirm path.
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
        // Initial state sent on join uses the confirmed grid (DB truth) so
        // a fresh session never inherits ghost pixels from in-flight txs.
        gridState: pixelGrid.getConfirmedGrid(),
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
  socket.on('pixels:submit', ({ txHash, pixels } = {}) => {
    const address = socket.walletAddress;
    if (!address) return;
    // NB: txHash MAY be empty here — some wallet variants return a signed tx
    // whose `.getHash()` is missing/empty. We still ack the client so their
    // pending pixel UI clears. The devnet watcher only runs when we have
    // both a hash AND pixels to register.
    if (txHash) {
      console.log(`💰 PIXEL tx submitted by ${address.slice(0, 10)}...: ${txHash}`);
    } else {
      console.log(`💰 PIXEL tx submitted by ${address.slice(0, 10)}... (no hash — wallet returned empty)`);
    }

    // Register the pending tx so the server polls devnet for its outcome
    // independently of whether the user's tab stays open.
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
        // Fire-and-forget — the watcher self-reports and self-cleans. If it
        // ever rejects unexpectedly (vs. handling its own poll errors inside),
        // force a rollback so pixels can't ghost forever in pendingTxs.
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

    // Optimistic acknowledgement — fires even when txHash is empty, so the
    // client's pending UI clears regardless of which wallet shape we got.
    socket.emit('pixels:committed', { txHash: txHash ?? '' });
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
    if (!address || !Array.isArray(pixels) || pixels.length === 0) {
      console.warn(`[pixels:confirm] rejected — addr=${!!address} pixels=${Array.isArray(pixels) ? pixels.length : 'n/a'}`);
      return;
    }
    // Defense-in-depth: a colorless payload here means the client regressed
    // the Toolbar.jsx fix that passes full pixels to watchPaintTx. We log
    // loudly so the bug shows up immediately instead of silently filtering.
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
        // Server-side watcher may have the same tx pending; clear it so we
        // don't double-process or timeout-revert what's already saved.
        if (txHash) pendingTxs.delete(txHash);
      } else {
        console.warn(`[pixels:confirm] persistPixels returned 0 for ${pixels.length} input pixels (tx ${txHash ?? 'n/a'})`);
      }
    } catch (e) {
      console.error('[pixels:confirm] persist failed:', e?.message ?? e);
      socket.emit('error', { message: 'Failed to persist confirmed pixels' });
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
      // Serve the CONFIRMED grid (DB-persisted pixels only) so a client
      // refreshing after a failed paintPixels tx never sees ghost pixels.
      // Live `pixel:update` broadcasts continue to layer optimistic pixels
      // on top during the session.
      socket.emit('canvas:init', { gridState: pixelGrid.getConfirmedGrid() });
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

// NOTE: The previous `/canvas/upload` and `/canvas/upload-section` routes
// (plus the catbox.moe + 0x0.st `uploadToPublicHost` helper) were removed:
// both public hosts are dead (catbox 404, 0x0.st 503 "uploads disabled").
// The client now mints NFTs with the per-epoch snapshot URLs written by
// `POST /snapshots/epoch/:n` — viewable on the website's NftPage, not on
// the on-chain explorer. If a publicly-reachable URI is ever needed again,
// add a new host helper here (ImgBB, Cloudinary, ngrok-tunnelled snapshot).

/**
 * POST /snapshots/epoch/:n
 * Body: { sx, sy, w?, h?, scale? }
 *
 * Writes TWO immutable PNGs to disk capturing the current canvas state +
 * auction zone for epoch N. Returns the URLs to serve them:
 *   { canvasUrl: '/snapshots/epoch/3/canvas.png',
 *     zoneUrl:   '/snapshots/epoch/3/zone.png' }
 *
 * Called by AdminPage.handleEndEpoch BEFORE attempting the public-host upload.
 * Snapshots persist across canvas wipes (clearAll), so the website's NFT
 * gallery can always render the canvas as it was at that epoch's end —
 * even if catbox/0x0.st fails. The on-chain NFT URI still wants a
 * publicly-reachable URL (next layer), but these local files guarantee
 * the website never shows a stale or blank image for an old epoch.
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

    // Render BOTH from the CONFIRMED grid — only pixels that are persisted
    // to SQLite (i.e. paid for on-chain). The live `grid` includes
    // optimistic socket-paint pixels that may never settle as ESDT
    // transfers, and those must NEVER bleed into the NFT artwork frozen
    // into the on-chain URI for this epoch.
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

    // Co-creation AI: fire-and-forget. Don't block the HTTP response (and
    // therefore the admin's endEpoch tx) on a 15–30 s OpenAI round-trip.
    // The NFT URI points at `painter.png`; until this job finishes the
    // GET handler below falls back to `canvas.png`. When the job lands,
    // the file swaps in automatically with no on-chain change.
    generatePainterArtifact(n, SNAPSHOTS_DIR).catch((err) => {
      console.error(`[painterAI] unhandled error for epoch ${n}:`, err?.message ?? err);
    });

    res.json({
      canvasUrl:  `/snapshots/epoch/${n}/canvas.png`,
      zoneUrl:    `/snapshots/epoch/${n}/zone.png`,
      painterUrl: `/snapshots/epoch/${n}/painter.png`,
    });
  } catch (err) {
    console.error('Snapshot write error:', err);
    res.status(500).json({ error: err.message ?? 'Snapshot failed' });
  }
});

/**
 * GET /snapshots/epoch/:n/canvas.png   (and .../zone.png)
 *
 * Serves the immutable snapshot PNGs written by POST /snapshots/epoch/:n.
 * 404 if the epoch was never snapshotted (e.g. epochs 4–8 in the old data,
 * which the NftPage handles by falling through to `null` image).
 */
app.get('/snapshots/epoch/:n/:kind.png', (req, res) => {
  try {
    const n = parseInt(req.params.n, 10);
    const kind = req.params.kind;
    if (!Number.isFinite(n) || n <= 0 || !['canvas', 'zone', 'painter'].includes(kind)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    let filePath = path.join(SNAPSHOTS_DIR, `epoch-${n}-${kind}.png`);

    // painter.png is written ~30 s after endEpoch by the async AI job.
    // While the job is in flight (or if it failed) fall through to the
    // raw pixel snapshot so the NFT image is never broken.
    if (kind === 'painter' && !fs.existsSync(filePath)) {
      const fallback = path.join(SNAPSHOTS_DIR, `epoch-${n}-canvas.png`);
      if (fs.existsSync(fallback)) {
        filePath = fallback;
        res.set('Cache-Control', 'no-cache');
        res.set('Content-Type', 'image/png');
        return res.sendFile(filePath);
      }
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `No ${kind} snapshot for epoch ${n}` });
    }
    res.set('Content-Type', 'image/png');
    // canvas + zone are immutable per epoch; painter.png becomes immutable
    // only once it's actually been written by the AI job (path above).
    res.set('Cache-Control',
      kind === 'painter'
        ? 'public, max-age=300'
        : 'public, max-age=31536000, immutable');
    res.sendFile(filePath);
  } catch (err) {
    console.error('Snapshot serve error:', err);
    res.status(500).json({ error: 'Failed to serve snapshot' });
  }
});

/**
 * GET /snapshots/epoch/:n/caption.txt
 *
 * Returns the AI-generated caption for the painter NFT, or 404 if the AI
 * job hasn't completed (or wasn't enabled) for that epoch.
 */
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

// Rehydrate the grid from SQLite before opening the port so the very first
// client connection sees the persisted canvas, not an empty grid. If the DB
// is unreadable we DO NOT silently start with a blank canvas — that's worse
// than a crash because clients then write over what should be the canonical
// confirmed state. Fail loud so a supervisor restarts and an operator looks.
try {
  pixelGrid.hydrateFromDb();
} catch (e) {
  console.error('💥 hydrateFromDb FAILED — refusing to start with empty grid:', e?.message ?? e);
  process.exit(1);
}

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
