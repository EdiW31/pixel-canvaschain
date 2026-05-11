import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pixelGrid from './pixelGrid.js';
import userManager from './userManager.js';
import { queryCredits } from './blockchain/contractClient.js';

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

// Socket.io event handlers
io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);

  /**
   * Event: wallet:join
   * Called by the frontend after sdk-dapp login.
   * Fetches on-chain credits, registers the wallet for this socket session.
   *
   * Payload: { address: "erd1..." }
   * Response: wallet:joined { address, credits, gridState }
   */
  socket.on('wallet:join', async ({ address } = {}) => {
    try {
      if (!address || !address.startsWith('erd1')) {
        socket.emit('error', { message: 'Invalid wallet address' });
        return;
      }

      // Query on-chain credits (free read, no gas)
      const onChainCredits = await queryCredits(address);

      // Register / refresh user in session manager
      userManager.joinUser(address, onChainCredits);
      socket.walletAddress = address;

      // Send current canvas state
      const gridState = pixelGrid.getGrid();

      socket.emit('wallet:joined', {
        address,
        credits: onChainCredits,
        gridState,
      });

      console.log(`💼 Wallet joined: ${address.slice(0, 10)}... | ${onChainCredits} credits`);
    } catch (error) {
      console.error('❌ wallet:join error:', error);
      socket.emit('error', { message: 'Failed to join with wallet' });
    }
  });

  /**
   * Event: pixel:paint
   * Validates session credits, updates grid, broadcasts to all clients.
   */
  socket.on('pixel:paint', ({ x, y, color }) => {
    try {
      const address = socket.walletAddress;

      if (!address) {
        socket.emit('error', { message: 'Wallet not joined. Emit wallet:join first.' });
        return;
      }

      // Rate limiting
      if (userManager.isRateLimited(address)) {
        socket.emit('error', { message: 'Rate limit exceeded. Max 10 pixels per second.' });
        return;
      }

      // Validate coordinates and color
      if (!pixelGrid.isValidCoordinate(x, y)) {
        socket.emit('error', { message: 'Invalid coordinates' });
        return;
      }
      if (!pixelGrid.isValidColor(color)) {
        socket.emit('error', { message: 'Invalid color format' });
        return;
      }

      // Deduct session credit
      const deductResult = userManager.deductCredits(address, 1);
      if (!deductResult.success) {
        socket.emit('error', { message: deductResult.message });
        return;
      }

      // Update pixel grid
      if (!pixelGrid.setPixel(x, y, color)) {
        socket.emit('error', { message: 'Failed to update pixel' });
        return;
      }

      userManager.recordPaint(address, x, y, color);

      // Broadcast to all clients
      io.emit('pixel:update', { x, y, color, address });

      // Notify painter of remaining session credits
      socket.emit('credits:updated', { credits: deductResult.credits });

      console.log(`🎨 Pixel painted: (${x}, ${y}) ${color} by ${address.slice(0, 10)}...`);
    } catch (error) {
      console.error('❌ Paint error:', error);
      socket.emit('error', { message: 'Failed to paint pixel' });
    }
  });

  /**
   * Event: pixels:paint
   * Batch pixel painting (brush mode).
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

      // Validate all pixels
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

      // Check session credits
      const user = userManager.getUser(address);
      if (!user || user.credits < pixels.length) {
        socket.emit('error', {
          message: `Insufficient credits. Need ${pixels.length}, have ${user?.credits ?? 0}`,
        });
        return;
      }

      // Deduct atomically
      const deductResult = userManager.deductCredits(address, pixels.length);
      if (!deductResult.success) {
        socket.emit('error', { message: deductResult.message });
        return;
      }

      // Update grid
      const paintedPixels = [];
      for (const pixel of pixels) {
        if (pixelGrid.setPixel(pixel.x, pixel.y, pixel.color)) {
          paintedPixels.push(pixel);
          userManager.recordPaint(address, pixel.x, pixel.y, pixel.color);
        }
      }

      io.emit('pixels:update', { pixels: paintedPixels, address });
      socket.emit('credits:updated', { credits: deductResult.credits });

      console.log(`🎨 Batch painted: ${paintedPixels.length} pixels by ${address.slice(0, 10)}...`);
    } catch (error) {
      console.error('❌ Batch paint error:', error);
      socket.emit('error', { message: 'Failed to paint pixels' });
    }
  });

  /**
   * Event: canvas:request
   * Send current canvas state (used for reconnection).
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
   * Event: stats:request
   */
  socket.on('stats:request', () => {
    try {
      const address = socket.walletAddress;
      socket.emit('stats:data', {
        grid: pixelGrid.getStats(),
        user: address ? userManager.getUserStats(address) : null,
        totalUsers: userManager.getUserCount(),
      });
    } catch (error) {
      console.error('❌ Stats request error:', error);
    }
  });

  /**
   * Event: disconnect
   */
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
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
║       🎨 Pixel CanvasChain Server - Phase 2 🎨          ║
║                                                          ║
║  Server running on: http://localhost:${PORT}              ║
║  Socket.io: Ready for connections                       ║
║  Canvas: ${String(pixelGrid.getStats().width).padEnd(3)}x${String(pixelGrid.getStats().height).padEnd(3)} pixels initialized         ║
║  Blockchain: MultiversX devnet (read-only)              ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
