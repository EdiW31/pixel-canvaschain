// SQLite persistence for the canvas — DB-first hydration on restart. One row
// per painted pixel in a single (x, y) primary-keyed `pixels` table; unpainted
// pixels are absent (the grid defaults them to DEFAULT_PIXEL_COLOR).
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const dbPath = join(DATA_DIR, 'canvas.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pixels (
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    color TEXT NOT NULL,
    address TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (x, y)
  );
`);

const upsertStmt = db.prepare(
  `INSERT INTO pixels (x, y, color, address, updated_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(x, y) DO UPDATE SET
     color = excluded.color,
     address = excluded.address,
     updated_at = excluded.updated_at`
);

const deleteStmt = db.prepare(`DELETE FROM pixels WHERE x = ? AND y = ?`);
const allStmt = db.prepare(`SELECT x, y, color FROM pixels`);
const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM pixels`);

export function loadAllPixels() {
  return allStmt.all();
}

export function pixelCount() {
  return countStmt.get().n;
}

export function savePixel(x, y, color, address) {
  upsertStmt.run(x, y, color, address ?? null, Date.now());
}

const upsertMany = db.transaction((rows) => {
  const now = Date.now();
  for (const r of rows) upsertStmt.run(r.x, r.y, r.color, r.address ?? null, now);
});

export function savePixels(batch) {
  if (!Array.isArray(batch) || batch.length === 0) return;
  upsertMany(batch);
}

const deleteMany = db.transaction((rows) => {
  for (const r of rows) deleteStmt.run(r.x, r.y);
});

export function deletePixels(pixels) {
  if (!Array.isArray(pixels) || pixels.length === 0) return;
  deleteMany(pixels);
}

const truncateStmt = db.prepare('DELETE FROM pixels');

// Wipe every row — called when the on-chain epoch increments.
export function clearAllPixels() {
  const result = truncateStmt.run();
  console.log(`🗑  Cleared ${result.changes} pixels from DB`);
  return result.changes;
}

export default db;
