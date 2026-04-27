import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import pixelGrid from './pixelGrid.js';
import userManager from './userManager.js';
import { TIERS } from './constants.js';

const app = express();
const httpServer = createServer(app);

// Configure CORS
app.use(cors({
  origin: 'http://localhost:5173', // Vite dev server
  credentials: true,
}));

// Socket.io setup with CORS
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 5001;

/**
 * Generate a random MultiversX-like wallet address
 * Format: erd1 + 62 random characters (bech32-like)
 * [FUTURE: This will be replaced by real wallet connection via @multiversx/sdk-dapp]
 */
function generateMockWalletAddress() {
  const randomBytes = crypto.randomBytes(31);
  const hex = randomBytes.toString('hex');
  return `erd1${hex}`;
}

/**
 * Simulate blockchain transaction delay (2 seconds)
 * [FUTURE: This will be real transaction waiting time]
 */
function simulateTransactionDelay() {
  return new Promise((resolve) => setTimeout(resolve, 2000));
}

// Socket.io event handlers
io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);

  /**
   * Event: wallet:connect
   * Generate a mock wallet address and assign initial balances
   * [FUTURE: Replace with real MultiversX wallet authentication]
   * [FUTURE: Use @multiversx/sdk-dapp for wallet connection]
   * [FUTURE: Query real EGLD balance from blockchain]
   */
  socket.on('wallet:connect', () => {
    try {
      // Generate random wallet address
      const address = generateMockWalletAddress();

      // Create user with initial balances
      const userData = userManager.createUser(address);

      // Send initial canvas state
      const gridState = pixelGrid.getGrid();

      // Store address in socket for later reference
      socket.walletAddress = address;

      socket.emit('wallet:connected', {
        address: userData.address,
        egld: userData.egld,
        credits: userData.credits,
        gridState: gridState,
      });

      console.log(`💼 Wallet connected: ${address}`);
    } catch (error) {
      console.error('❌ Wallet connection error:', error);
      socket.emit('error', { message: 'Failed to connect wallet' });
    }
  });

  /**
   * Event: credits:purchase
   * Handle credit purchase transaction
   * [FUTURE: Trigger real Smart Contract transaction]
   * [FUTURE: Sign transaction with user's wallet]
   * [FUTURE: Wait for blockchain confirmation]
   * [FUTURE: Smart Contract will handle 25/25/50 revenue split]
   */
  socket.on('credits:purchase', async ({ tierName }) => {
    try {
      const address = socket.walletAddress;

      if (!address) {
        socket.emit('error', { message: 'Wallet not connected' });
        return;
      }

      // Find tier
      const tier = TIERS.find((t) => t.name === tierName);
      if (!tier) {
        socket.emit('error', { message: 'Invalid tier' });
        return;
      }

      // Check balance
      const user = userManager.getUser(address);
      if (!user || user.egld < tier.cost) {
        socket.emit('error', {
          message: `Insufficient EGLD. Need ${tier.cost}, have ${user?.egld || 0}`,
        });
        return;
      }

      console.log(`💳 Processing purchase: ${address} | ${tierName} | ${tier.cost} EGLD`);

      // Simulate blockchain transaction delay (2 seconds)
      await simulateTransactionDelay();

      // Process purchase
      const result = userManager.purchaseCredits(address, tier.cost, tier.total);

      if (result.success) {
        socket.emit('credits:purchased', {
          tier: tierName,
          cost: tier.cost,
          credits: tier.total,
          newEgld: result.egld,
          newCredits: result.credits,
        });
        console.log(`✅ Purchase successful: ${address} | ${result.credits} credits`);
      } else {
        socket.emit('error', { message: result.message });
      }
    } catch (error) {
      console.error('❌ Purchase error:', error);
      socket.emit('error', { message: 'Purchase failed' });
    }
  });

  /**
   * Event: pixel:paint
   * Handle pixel painting
   * Validates credits, updates grid, broadcasts to all clients
   * [FUTURE: Sign paint action with wallet]
   * [FUTURE: Aggregate pixels and commit to blockchain every 10 min]
   */
  socket.on('pixel:paint', ({ x, y, color }) => {
    try {
      const address = socket.walletAddress;

      if (!address) {
        socket.emit('error', { message: 'Wallet not connected' });
        return;
      }

      // Check rate limiting
      if (userManager.isRateLimited(address)) {
        socket.emit('error', {
          message: 'Rate limit exceeded. Max 10 pixels per second.',
        });
        return;
      }

      // Validate coordinates
      if (!pixelGrid.isValidCoordinate(x, y)) {
        socket.emit('error', { message: 'Invalid coordinates' });
        return;
      }

      // Validate color
      if (!pixelGrid.isValidColor(color)) {
        socket.emit('error', { message: 'Invalid color format' });
        return;
      }

      // Deduct credits
      const deductResult = userManager.deductCredits(address, 1);
      if (!deductResult.success) {
        socket.emit('error', { message: deductResult.message });
        return;
      }

      // Update pixel grid
      const success = pixelGrid.setPixel(x, y, color);
      if (!success) {
        socket.emit('error', { message: 'Failed to update pixel' });
        return;
      }

      // Record paint action
      userManager.recordPaint(address, x, y, color);

      // Broadcast pixel update to all connected clients
      io.emit('pixel:update', { x, y, color, address });

      // Send updated credits to the painter
      socket.emit('credits:updated', { credits: deductResult.credits });

      console.log(`🎨 Pixel painted: (${x}, ${y}) ${color} by ${address.slice(0, 10)}...`);
    } catch (error) {
      console.error('❌ Paint error:', error);
      socket.emit('error', { message: 'Failed to paint pixel' });
    }
  });

  /**
   * Event: pixels:paint
   * Handle batch pixel painting (brush mode)
   * Validates credits, updates grid, broadcasts to all clients
   */
  socket.on('pixels:paint', ({ pixels }) => {
    try {
      const address = socket.walletAddress;

      if (!address) {
        socket.emit('error', { message: 'Wallet not connected' });
        return;
      }

      // Validate pixels array
      if (!Array.isArray(pixels) || pixels.length === 0) {
        socket.emit('error', { message: 'Invalid pixels data' });
        return;
      }

      // Limit max pixels per request (max 64 for 8x8 brush)
      if (pixels.length > 64) {
        socket.emit('error', { message: 'Too many pixels in single request (max 64)' });
        return;
      }

      // Check rate limiting
      if (userManager.isRateLimited(address)) {
        socket.emit('error', {
          message: 'Rate limit exceeded. Max 10 pixels per second.',
        });
        return;
      }

      // Validate all coordinates and colors
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

      // Check credits (1 credit per pixel)
      const user = userManager.getUser(address);
      if (!user || user.credits < pixels.length) {
        socket.emit('error', {
          message: `Insufficient credits. Need ${pixels.length}, have ${user?.credits || 0}`,
        });
        return;
      }

      // Deduct credits atomically
      const deductResult = userManager.deductCredits(address, pixels.length);
      if (!deductResult.success) {
        socket.emit('error', { message: deductResult.message });
        return;
      }

      // Update all pixels in grid
      const paintedPixels = [];
      for (const pixel of pixels) {
        const success = pixelGrid.setPixel(pixel.x, pixel.y, pixel.color);
        if (success) {
          paintedPixels.push(pixel);
          // Record paint action for stats
          userManager.recordPaint(address, pixel.x, pixel.y, pixel.color);
        }
      }

      // Broadcast pixel updates to all connected clients
      io.emit('pixels:update', { pixels: paintedPixels, address });

      // Send updated credits to the painter
      socket.emit('credits:updated', { credits: deductResult.credits });

      console.log(`🎨 Batch painted: ${paintedPixels.length} pixels by ${address.slice(0, 10)}...`);
    } catch (error) {
      console.error('❌ Batch paint error:', error);
      socket.emit('error', { message: 'Failed to paint pixels' });
    }
  });

  /**
   * Event: canvas:request
   * Send current canvas state to client
   * Used for initial load or reconnection
   */
  socket.on('canvas:request', () => {
    try {
      const gridState = pixelGrid.getGrid();
      socket.emit('canvas:init', { gridState });
    } catch (error) {
      console.error('❌ Canvas request error:', error);
      socket.emit('error', { message: 'Failed to load canvas' });
    }
  });

  /**
   * Event: stats:request
   * Send grid and user statistics
   */
  socket.on('stats:request', () => {
    try {
      const address = socket.walletAddress;
      const gridStats = pixelGrid.getStats();
      const userStats = address ? userManager.getUserStats(address) : null;

      socket.emit('stats:data', {
        grid: gridStats,
        user: userStats,
        totalUsers: userManager.getUserCount(),
      });
    } catch (error) {
      console.error('❌ Stats request error:', error);
    }
  });

  /**
   * Event: disconnect
   * Handle client disconnection
   */
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    // Note: We keep user data in memory for Phase 1
    // [FUTURE: Persist user state to database]
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    users: userManager.getUserCount(),
    gridStats: pixelGrid.getStats(),
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║       🎨 Pixel CanvasChain Server - Phase 1 🎨          ║
║                                                          ║
║  Server running on: http://localhost:${PORT}              ║
║  Socket.io: Ready for connections                       ║
║  Canvas: 300x300 pixels initialized                     ║
║  Brush: Supports 2x2 to 8x8 painting                    ║
║                                                          ║
║  [FUTURE: MultiversX Smart Contract integration]        ║
║  [FUTURE: IPFS snapshot uploads every 10 minutes]       ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
