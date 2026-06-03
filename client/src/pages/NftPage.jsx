/*
 * MANUAL SETUP — required before NFTs appear here
 *
 * 1. Go to https://devnet-wallet.multiversx.com → ESDT tab → "Issue Collection"
 *    - Type:   NFT
 *    - Name:   PixelCanvas
 *    - Ticker: PCANVAS  (uppercase letters only; devnet appends a random suffix)
 *
 * 2. After issuance open the collection page → Roles →
 *    grant ESDTNFTCreate to the contract address
 *    (found in client/.env as VITE_CONTRACT_ADDRESS)
 *
 * 3. Add to client/.env:
 *      VITE_NFT_COLLECTION=PCANVAS-xxxxxx   ← exact ticker shown after issuance
 *
 * 4. Restart the client dev server  (npm run dev)
 *
 * 5. From the Admin page, call  setNftCollection(PCANVAS-xxxxxx)  on the contract.
 *
 * After these 5 steps, the next endEpoch call mints NFTs that appear here within ~60 s.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav from '../components/MarketingNav';

const COLLECTION = import.meta.env.VITE_NFT_COLLECTION;
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';
const DEVNET_API = 'https://devnet-api.multiversx.com';
const EXPLORER  = 'https://devnet-explorer.multiversx.com';

/**
 * Resolve the best displayable image URL for a given NFT.
 *
 * The on-chain URI for epochs 4–8 historically points to
 * `http://localhost:5001/canvas/png`, which is a) unreachable from any
 * external viewer and b) a LIVE endpoint that renders the *current*
 * canvas — not the snapshot at that epoch's end. So even the user's own
 * browser sees the wrong image once the canvas wipes for the next epoch.
 *
 * Recovery strategy: if the on-chain URI looks broken (localhost / no
 * URI / live endpoint), substitute the server's per-epoch snapshot route
 * `/snapshots/epoch/:n/canvas.png` (or `.../zone.png`) derived from the
 * NFT's `attributes` field. The snapshot is the SAME content the NFT
 * meant to capture — just hosted from the user's machine instead of
 * the dead catbox URL. Future epochs (after the upload guard lands)
 * will already have correct https URIs and bypass this fallback.
 */
function resolveImageUrl(nft, attrs) {
  const onChainUrl =
    nft.url ||
    nft.media?.[0]?.url ||
    nft.assets?.pngUrl ||
    (nft.uris?.[0] ? atob(nft.uris[0]) : null);

  // If we have a real https URL that ISN'T pointing at the live
  // `/canvas/png` endpoint, use it directly.
  if (
    onChainUrl &&
    onChainUrl.startsWith('https://') &&
    !onChainUrl.includes('/canvas/png') &&
    !onChainUrl.includes('/canvas/section-png')
  ) {
    return onChainUrl;
  }

  // Otherwise fall back to the local per-epoch snapshot.
  const epoch = attrs.epoch;
  if (!epoch) return onChainUrl ?? null; // no way to derive snapshot path
  // Three NFT types, each served from a distinct per-epoch file:
  //   - auction → 20×20 zone image
  //   - ai      → AI-generated reinterpretation (falls back to canvas.png
  //               server-side while the AI job is still running)
  //   - painter → raw full-canvas pixel art (the default)
  const kind =
    attrs.type === 'auction' ? 'zone' :
    attrs.type === 'ai'      ? 'ai'   :
                               'canvas';
  return `${SERVER_URL}/snapshots/epoch/${epoch}/${kind}.png`;
}

function truncate(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function parseAttributes(rawAttributes) {
  if (!rawAttributes) return {};
  try {
    const decoded = atob(rawAttributes);
    return Object.fromEntries(
      decoded.split(';').map(pair => {
        const idx = pair.indexOf(':');
        return [pair.slice(0, idx).trim(), pair.slice(idx + 1).trim()];
      })
    );
  } catch {
    return {};
  }
}

/* ── Type badge ─────────────────────────────────────────────────────────────── */
/**
 * Three NFT types share the badge:
 *   - auction → purple (zone winner)
 *   - ai      → teal/cyan (AI Vision — the AI's reinterpretation)
 *   - painter → amber (top painter, raw canvas pixel art)
 */
function TypeBadge({ type }) {
  const palette =
    type === 'auction' ? { grad: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)', shadow: 'rgba(124,58,237,0.40)', icon: '🏆', label: 'Auction Winner' } :
    type === 'ai'      ? { grad: 'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)', shadow: 'rgba(6,182,212,0.40)',  icon: '🤖', label: 'AI Vision' } :
                         { grad: 'linear-gradient(135deg, #b45309 0%, #92400e 100%)', shadow: 'rgba(180,83,9,0.35)',  icon: '🎨', label: 'Top Painter' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        background: palette.grad,
        color: '#fff',
        boxShadow: `0 2px 8px ${palette.shadow}`,
      }}
    >
      {palette.icon} {palette.label}
    </span>
  );
}

/* ── NFT Card ───────────────────────────────────────────────────────────────── */
function NftCard({ nft }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiCaption, setAiCaption] = useState('');
  // aiReady: null = status not yet polled; false = AI job in progress; true = ai.png on disk.
  const [aiReady, setAiReady] = useState(null);

  const attrs = parseAttributes(nft.attributes);
  // Type detection: prefer the on-chain attribute, fall back to name patterns.
  const lowerName = (nft.name ?? '').toLowerCase();
  const nftType =
    attrs.type ??
    (lowerName.includes('auction')   ? 'auction' :
     lowerName.includes('ai vision') ? 'ai'      :
                                       'painter');
  const imageUrl = resolveImageUrl(nft, { ...attrs, type: nftType });
  const isAuction = nftType === 'auction';
  const isAI      = nftType === 'ai';

  // AI Vision cards poll the server for the AI artifact's status. Until
  // `ready: true`, the card shows a "Waiting for AI generation…" overlay
  // instead of the canvas fallback the server would otherwise serve. Once
  // ready, we also fetch the caption that the vision step wrote.
  useEffect(() => {
    if (!isAI || !attrs.epoch) return;
    let cancelled = false;
    let pollId = null;
    const POLL_MS = 5000;
    const MAX_POLLS = 30; // ~2.5 minutes
    let polls = 0;

    const fetchCaption = () =>
      fetch(`${SERVER_URL}/snapshots/epoch/${attrs.epoch}/caption.txt`)
        .then(r => (r.ok ? r.text() : ''))
        .then(text => { if (!cancelled) setAiCaption((text || '').trim()); })
        .catch(() => {});

    const tick = () => {
      polls += 1;
      fetch(`${SERVER_URL}/snapshots/epoch/${attrs.epoch}/ai-status`)
        .then(r => (r.ok ? r.json() : { ready: false }))
        .then(({ ready }) => {
          if (cancelled) return;
          setAiReady(!!ready);
          if (ready) {
            fetchCaption();
            return; // stop polling
          }
          if (polls < MAX_POLLS) pollId = setTimeout(tick, POLL_MS);
        })
        .catch(() => {
          if (!cancelled && polls < MAX_POLLS) pollId = setTimeout(tick, POLL_MS);
        });
    };
    tick();
    return () => { cancelled = true; if (pollId) clearTimeout(pollId); };
  }, [isAI, attrs.epoch]);

  // Per-type accent palette — auction purple, AI teal, painter amber.
  const accentColor      = isAuction ? '#7c3aed'              : isAI ? '#06b6d4'              : '#b45309';
  const accentColorFaint = isAuction ? 'rgba(124,58,237,0.12)' : isAI ? 'rgba(6,182,212,0.12)' : 'rgba(180,83,9,0.10)';
  const accentBorder     = isAuction ? 'rgba(124,58,237,0.35)' : isAI ? 'rgba(6,182,212,0.35)' : 'rgba(180,83,9,0.30)';

  const copyOwner = () => {
    if (!nft.owner) return;
    navigator.clipboard.writeText(nft.owner).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${hovered ? accentBorder : 'rgb(var(--border))'}`,
        background: 'rgb(var(--surface))',
        boxShadow: hovered
          ? `0 8px 32px ${accentColor}28, 0 2px 8px rgba(0,0,0,0.18)`
          : '0 2px 8px rgba(0,0,0,0.10)',
        transition: 'box-shadow 0.25s ease, border-color 0.25s ease, transform 0.2s ease',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Image area ── */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '1 / 1',
          background: 'rgb(var(--bg-alt))',
          overflow: 'hidden',
        }}
      >
        {isAI && aiReady === false ? (
          // AI Vision card, AI job still running. Show a clear waiting state
          // instead of the canvas-fallback the server would otherwise serve —
          // shipping the pixel art under an "AI's view" caption misleads.
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
              background: `radial-gradient(circle at 50% 40%, ${accentColorFaint} 0%, transparent 70%)`,
              padding: '16px',
            }}
          >
            <div
              style={{
                width: 44, height: 44,
                border: '3px solid rgba(6,182,212,0.25)',
                borderTopColor: '#06b6d4',
                borderRadius: '50%',
                animation: 'nft-spin 1s linear infinite',
              }}
            />
            <p style={{ fontSize: 13, fontWeight: 700, color: 'rgb(var(--text-primary))', margin: 0 }}>
              Waiting for AI generation…
            </p>
            <p style={{ fontSize: 11, color: 'rgb(var(--text-muted))', maxWidth: 220, textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
              GPT-image-1 is painting epoch {attrs.epoch}. This usually takes 20–30&nbsp;seconds.
            </p>
            <style>{`@keyframes nft-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={nft.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              // AI image is a real photo-style rendering — keep it smooth.
              // Painter/Auction images are pixel-grid snapshots — keep them crisp.
              imageRendering: isAI ? 'auto' : 'pixelated',
              display: 'block',
              transition: 'transform 0.35s ease',
              transform: hovered ? 'scale(1.04)' : 'scale(1)',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              background: `radial-gradient(circle at 50% 40%, ${accentColorFaint} 0%, transparent 70%)`,
            }}
          >
            <span style={{ fontSize: 48, lineHeight: 1 }}>{isAuction ? '🏆' : isAI ? '🤖' : '🎨'}</span>
            <span style={{ fontSize: 11, color: 'rgb(var(--text-muted))', fontWeight: 500 }}>
              No image yet
            </span>
          </div>
        )}

        {/* Epoch badge overlay */}
        {attrs.epoch && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              padding: '3px 9px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(6px)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            EPOCH {attrs.epoch}
          </div>
        )}

        {/* NFT number badge */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '3px 9px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            color: 'rgba(255,255,255,0.80)',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'monospace',
          }}
        >
          #{nft.nonce}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>

        {/* Name + type */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ fontFamily: 'var(--font-heading, sans-serif)', fontWeight: 700, fontSize: 15, color: 'rgb(var(--text-primary))', lineHeight: 1.3, margin: 0 }}>
            {nft.name}
          </p>
          <TypeBadge type={nftType} />
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {attrs.pixels && (
            <StatChip icon="🖌" label="Pixels" value={Number(attrs.pixels).toLocaleString()} color={accentColor} />
          )}
          {attrs.section && (
            <StatChip icon="📍" label="Zone" value={attrs.section} color={accentColor} />
          )}
          {nft.royalties > 0 && (
            <StatChip icon="💸" label="Royalties" value={`${nft.royalties / 100}%`} color="#22c55e" />
          )}
        </div>

        {/* AI caption — only on the AI Vision card. The vision model wrote
            a one-sentence description of the collaborative pixel art that
            was used as the prompt for the AI image. */}
        {isAI && aiCaption && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid rgba(6,182,212,0.22)',
              background: 'rgba(6,182,212,0.06)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1.1, flexShrink: 0 }}>🤖</span>
            <p style={{
              margin: 0,
              fontSize: 11,
              fontStyle: 'italic',
              color: 'rgb(var(--text-secondary))',
              lineHeight: 1.45,
            }}>
              <span style={{ fontWeight: 600, fontStyle: 'normal', color: accentColor }}>
                AI's view:
              </span>{' '}
              “{aiCaption}”
            </p>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgb(var(--border))' }} />

        {/* Owner row */}
        {nft.owner ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'rgb(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                Owner
              </p>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: 'rgb(var(--text-secondary))',
                }}
              >
                {truncate(nft.owner)}
              </span>
            </div>
            <button
              onClick={copyOwner}
              title="Copy full address"
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 8,
                border: '1px solid rgb(var(--border))',
                background: copied ? `${accentColor}18` : 'rgb(var(--bg-alt))',
                color: copied ? accentColor : 'rgb(var(--text-muted))',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'rgb(var(--text-muted))', fontStyle: 'italic' }}>No owner data</p>
        )}

        {/* Explorer link */}
        <a
          href={`${EXPLORER}/nfts/${nft.identifier}`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px',
            borderRadius: 10,
            border: `1px solid ${hovered ? accentBorder : 'rgb(var(--border))'}`,
            background: hovered ? accentColorFaint : 'transparent',
            color: hovered ? accentColor : 'rgb(var(--text-secondary))',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all 0.2s ease',
            marginTop: 'auto',
          }}
        >
          View on Explorer ↗
        </a>
      </div>
    </div>
  );
}

/* ── Stat chip ──────────────────────────────────────────────────────────────── */
function StatChip({ icon, label, value, color }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 8,
        background: `${color}12`,
        border: `1px solid ${color}28`,
        fontSize: 11,
        fontWeight: 600,
        color: 'rgb(var(--text-secondary))',
      }}
    >
      <span>{icon}</span>
      <span style={{ color: 'rgb(var(--text-muted))', fontWeight: 500 }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

/* ── Setup required ─────────────────────────────────────────────────────────── */
function SetupRequired() {
  return (
    <div className="card max-w-lg mx-auto mt-16 text-center flex flex-col gap-4">
      <div className="text-5xl">🖼️</div>
      <h2 className="font-heading text-xl font-semibold text-textPrimary">
        NFT collection not yet configured
      </h2>
      <p className="text-textSecondary text-sm leading-relaxed">
        The on-chain NFT collection hasn't been set up yet.
        Check the comment at the top of <code>NftPage.jsx</code> for the 5-step setup guide,
        then add <code>VITE_NFT_COLLECTION</code> to <code>client/.env</code> and restart.
      </p>
      <Link to="/" className="btn-primary self-center">← Back to Home</Link>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */
const NftPage = () => {
  const [nfts, setNfts]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchNfts = useCallback(async () => {
    try {
      const res = await fetch(
        `${DEVNET_API}/collections/${COLLECTION}/nfts?size=100`
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setNfts(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!COLLECTION) { setLoading(false); return; }
    fetchNfts();
    const id = setInterval(fetchNfts, 60_000);
    return () => clearInterval(id);
  }, [fetchNfts]);

  if (!COLLECTION) return (
    <>
      <MarketingNav />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <SetupRequired />
      </main>
    </>
  );

  return (
    <>
      <MarketingNav />
      <main className="max-w-5xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <div className="pill mb-3 inline-flex">NFT Gallery</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-textPrimary mb-2">
            Epoch NFTs
          </h1>
          <p className="text-textSecondary text-sm">
            Two NFTs minted every epoch — one for the top painter, one for the auction winner.{' '}
            <span className="text-textMuted">
              Collection{' '}
              <a
                href={`${EXPLORER}/collections/${COLLECTION}`}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline font-mono"
              >
                {COLLECTION}
              </a>
              {' '}· auto-refreshes every 60 s
            </span>
          </p>

          {/* Legend */}
          {!loading && nfts.length > 0 && (
            <div className="flex items-center gap-4 mt-4 flex-wrap">
              <LegendItem color="#b45309" shadow="rgba(180,83,9,0.30)" label="Top Painter NFT" icon="🎨" />
              <LegendItem color="#7c3aed" shadow="rgba(124,58,237,0.30)" label="Auction Winner NFT" icon="🏆" />
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-3 py-24 text-textMuted">
            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Loading NFTs…
          </div>
        )}

        {error && !loading && (
          <div className="card max-w-sm mx-auto text-center text-sm text-error py-8">
            Failed to load NFTs: {error}
          </div>
        )}

        {!loading && !error && nfts.length === 0 && (
          <div className="card max-w-sm mx-auto text-center flex flex-col gap-3 py-14">
            <div className="text-5xl">🏷️</div>
            <p className="font-heading font-semibold text-textPrimary">No NFTs minted yet</p>
            <p className="text-textSecondary text-sm">
              They appear here after the first <em>endEpoch</em> call from the Admin page.
            </p>
          </div>
        )}

        {!loading && nfts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {nfts.map(nft => (
              <NftCard key={nft.identifier} nft={nft} />
            ))}
          </div>
        )}
      </main>
    </>
  );
};

function LegendItem({ color, shadow, label, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span
        style={{
          width: 10, height: 10, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${shadow}`,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, color: 'rgb(var(--text-secondary))', fontWeight: 500 }}>
        {icon} {label}
      </span>
    </div>
  );
}

export default NftPage;
