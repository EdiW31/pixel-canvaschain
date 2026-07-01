import { useEffect, useState } from 'react';
import { Transaction } from '@multiversx/sdk-core/out/core/transaction';
import { Address } from '@multiversx/sdk-core/out/core/address';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager/TransactionManager';
import { useCanvas } from '../hooks/useCanvas';
import { useApp } from '../context/AppContext';
import { useSocket } from '../hooks/useSocket';
import { getDappProvider } from '../hooks/useWallet';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ?? 'D';
const PIXEL_TOKEN_ID = import.meta.env.VITE_PIXEL_TOKEN_ID ?? 'PIXEL-a7cad6';

const MIN_BRUSH = 1;
const MAX_BRUSH = 4;

const toHex = (str) => Array.from(new TextEncoder().encode(str))
  .map((b) => b.toString(16).padStart(2, '0')).join('');

// Pad to even length (required for tx data hex args).
const evenHex = (hex) => (hex.length % 2 === 0 ? hex : '0' + hex);

const Toolbar = () => {
  const { zoom, hoverPixel, zoomIn, zoomOut, resetView, minZoom, MAX_ZOOM } = useCanvas();
  const {
    brushSize, setBrushSize, selectedColor,
    pendingPixels, pendingCount, undoPendingPixels, clearPendingPixels,
    wallet, showToast, refetchPixelBalance,
  } = useApp();
  const { notifyPixelsSubmitted, watchPaintTx, socket, isConnected } = useSocket();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txSent, setTxSent] = useState(false);

  const handleUndo = () => {
    const reverts = undoPendingPixels(); // reverts local gridState + clears pending
    if (reverts.length && socket && isConnected) {
      // Restore original colors on the server so other clients see the revert.
      socket.emit('pixels:paint', { pixels: reverts });
    }
    if (reverts.length) {
      showToast(`${reverts.length} pixel${reverts.length !== 1 ? 's' : ''} undone.`, 'info');
    }
  };

  useEffect(() => {
    if (pendingCount === 0) setTxSent(false);
  }, [pendingCount]);

  // Keyboard shortcuts: [ ] brush size, R reset view, +/- zoom.
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case '[': setBrushSize((b) => Math.max(MIN_BRUSH, b - 1)); break;
        case ']': setBrushSize((b) => Math.min(MAX_BRUSH, b + 1)); break;
        case 'r': case 'R': resetView(); break;
        case '+': case '=': zoomIn(); break;
        case '-': case '_': zoomOut(); break;
        default: return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setBrushSize, resetView, zoomIn, zoomOut]);

  const handleSubmit = async () => {
    if (pendingCount === 0 || isSubmitting) return;

    const dappProvider = getDappProvider();
    if (!dappProvider || dappProvider.getType?.() === 'empty') {
      showToast('Wallet provider not ready. Please reconnect.', 'error');
      return;
    }
    if (!wallet.address) {
      showToast('Wallet not connected.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const pixels = Array.from(pendingPixels.values());

      // Worst-case amount: assume every pixel is an overpaint (2 PIXEL each).
      // The contract refunds any excess.
      const amount = BigInt(pixels.length * 2);
      const amountHex = evenHex(amount.toString(16));

      // ManagedVec<PixelData>: per pixel, (x u32 BE)(y u32 BE)(color u32 BE),
      // where color is '#RRGGBB' → uint32 with a zero upper byte.
      const pixelDataHex = pixels.map((p) => {
        const x = p.x.toString(16).padStart(8, '0');
        const y = p.y.toString(16).padStart(8, '0');
        const colorHex = p.color.replace('#', '').padStart(8, '0');
        return x + y + colorHex;
      }).join('');

      // ESDTTransfer@tokenId@amount@paintPixels@pixelData
      const data =
        `ESDTTransfer@${toHex(PIXEL_TOKEN_ID)}@${amountHex}@${toHex('paintPixels')}@${pixelDataHex}`;

      // Base gas covers ESDT validation + refund; 3M per pixel covers its storage
      // reads/writes and a possible royalty ESDT send.
      const gasLimit = BigInt(Math.max(30_000_000, 20_000_000 + pixels.length * 3_000_000));

      const tx = new Transaction({
        nonce: 0n,
        value: 0n,
        sender: Address.newFromBech32(wallet.address),
        receiver: Address.newFromBech32(CONTRACT_ADDRESS),
        gasLimit,
        data: new TextEncoder().encode(data),
        chainID: CHAIN_ID,
      });

      const signedTxs = await dappProvider.signTransactions([tx]);
      await TransactionManager.getInstance().send(signedTxs);
      setTxSent(true);

      const txHash = signedTxs[0].getHash?.().toString() ?? '';

      // Clear pending the moment the tx is broadcast: it's irreversible now, so
      // keeping "Submit & Pay" visible would mislead and allow a double-sign.
      // Doesn't rely on the server ack, since some wallets return no tx hash.
      clearPendingPixels();
      showToast(`${pixels.length} pixel${pixels.length !== 1 ? 's' : ''} submitted!`, 'success');

      // Let the server's own watcher persist/revert regardless of this tab.
      if (txHash) notifyPixelsSubmitted(txHash, pixels);

      // Poll devnet for the outcome in the background. Pass FULL pixels (with
      // color): the success path emits pixels:confirm with these, and colorless
      // pixels fail server validation and never persist.
      if (txHash) {
        watchPaintTx(txHash, pixels).catch((err) => {
          console.warn('[watchPaintTx] error:', err?.message);
        });
      }

      // Refresh PIXEL balance after devnet confirms.
      setTimeout(refetchPixelBalance, 8_000);
      setTimeout(refetchPixelBalance, 20_000);
    } catch (err) {
      console.error('[Submit & Pay]', err);
      showToast(err?.message ?? 'Transaction failed. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-52 card p-3 space-y-3">
      <h3 className="font-heading text-sm font-semibold">Tools</h3>

      {pendingCount > 0 && (
        <Section label="Pending">
          <div className="bg-primaryLight/50 border border-primary/30 rounded-lg p-2.5 space-y-2">
            <p className="text-xs text-textSecondary">
              <span className="font-semibold text-textPrimary">{pendingCount}</span>{' '}
              pixel{pendingCount !== 1 ? 's' : ''} painted
            </p>
            <p className="text-xs text-textMuted">
              Est. cost:{' '}
              <span className="font-semibold text-primary">
                ~{pendingCount}–{pendingCount * 2}
              </span>{' '}
              PIXEL
            </p>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn-primary w-full text-xs py-2 justify-center"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-[#1B1A17]/30 border-t-[#1B1A17] rounded-full animate-spin" />
                  Signing…
                </span>
              ) : (
                'Submit & Pay'
              )}
            </button>
            {/* Undo only before signing — once broadcast it can't refund tokens. */}
            {!isSubmitting && !txSent && (
              <button
                onClick={handleUndo}
                className="w-full text-xs py-2 rounded-lg border border-border text-textSecondary hover:text-error hover:border-error/50 hover:bg-error/5 transition-colors flex items-center justify-center gap-1.5"
              >
                <UndoIcon />
                Undo all
              </button>
            )}
          </div>
        </Section>
      )}

      <Section label="Shortcuts">
        <div className="space-y-1 text-xs text-textSecondary bg-backgroundAlt rounded-md p-2">
          <Shortcut keys={['[', ']']} desc="Brush size" />
          <Shortcut keys={['+', '−']} desc="Zoom" />
          <Shortcut keys={['R']}      desc="Reset view" />
        </div>
      </Section>

      <Section label="Zoom">
        <div className="flex items-center gap-2 mb-1.5">
          <IconBtn onClick={zoomOut} disabled={zoom <= minZoom} title="Zoom out (-)">−</IconBtn>
          <div className="flex-1 text-center font-semibold tabular-nums">
            {zoom.toFixed(1)}<span className="text-textMuted text-xs ml-0.5">×</span>
          </div>
          <IconBtn onClick={zoomIn} disabled={zoom >= MAX_ZOOM} title="Zoom in (+)">+</IconBtn>
        </div>
        <div className="w-full bg-backgroundAlt rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((zoom - minZoom) / (MAX_ZOOM - minZoom)) * 100}%` }}
          />
        </div>
      </Section>

      <Section label="Brush">
        <div className="flex items-center justify-center mb-2 h-10 bg-backgroundAlt rounded-md">
          <div
            className="rounded-sm border border-borderStrong"
            style={{
              width:  `${brushSize * 8}px`,
              height: `${brushSize * 8}px`,
              backgroundColor: selectedColor,
            }}
          />
        </div>

        <div className="grid grid-cols-4 gap-1 mb-1.5">
          {[1, 2, 3, 4].map((size) => (
            <button
              key={size}
              onClick={() => setBrushSize(size)}
              className={`py-1.5 rounded-md text-xs font-semibold transition-colors ${
                brushSize === size
                  ? 'bg-primary text-textPrimary border border-primaryDark/40'
                  : 'bg-backgroundAlt text-textSecondary hover:bg-border'
              }`}
              style={brushSize === size ? { color: '#1B1A17' } : {}}
            >
              {size}×{size}
            </button>
          ))}
        </div>

        <p className="text-xs text-textMuted text-center">
          <span className="font-semibold text-primary">{brushSize * brushSize}</span>{' '}
          PIXEL / stroke
        </p>
      </Section>

      <button onClick={resetView} className="btn-secondary w-full text-sm">
        <RecenterIcon /> Reset view
      </button>

      <Section label="Cursor">
        <div className="bg-backgroundAlt rounded-md p-2">
          {hoverPixel ? (
            <div className="space-y-0.5 font-mono text-sm">
              <Row k="X" v={hoverPixel.x} />
              <Row k="Y" v={hoverPixel.y} />
            </div>
          ) : (
            <p className="text-xs text-textMuted text-center">Hover the canvas</p>
          )}
        </div>
      </Section>
    </div>
  );
};

// Sub-components

const Section = ({ label, children }) => (
  <div>
    <p className="text-xs uppercase tracking-wider text-textMuted font-medium mb-2">{label}</p>
    {children}
  </div>
);

const IconBtn = ({ onClick, disabled, title, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="w-8 h-8 rounded-md border border-border text-textPrimary hover:bg-backgroundAlt disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium text-base flex items-center justify-center"
  >
    {children}
  </button>
);

const Row = ({ k, v }) => (
  <div className="flex justify-between">
    <span className="text-textMuted">{k}</span>
    <span className="text-textPrimary font-semibold tabular-nums">{v}</span>
  </div>
);

const Shortcut = ({ keys, desc }) => (
  <div className="flex items-center justify-between">
    <span>{desc}</span>
    <span className="flex items-center gap-1">
      {keys.map((k, i) => (
        <kbd key={i} className="px-1.5 py-0.5 bg-backgroundAlt border border-border rounded text-[10px] font-mono">
          {k}
        </kbd>
      ))}
    </span>
  </div>
);

const UndoIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v6h6" />
    <path d="M3 13C5.5 7.5 11 4 17 5.5A9 9 0 0 1 21 13" />
  </svg>
);

const RecenterIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default Toolbar;
