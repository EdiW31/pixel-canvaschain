import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

function formatCountdown(msLeft) {
  if (msLeft <= 0) return 'ending…';
  const s = Math.floor(msLeft / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

/**
 * EpochBanner — shows "🔴 Epoch N is live · Xd Xh Xm" anywhere in the UI.
 * Hidden when no epoch is active (epoch === 0).
 */
const EpochBanner = ({ className = '' }) => {
  const { epochInfo } = useApp();
  const [msLeft, setMsLeft] = useState(0);

  useEffect(() => {
    if (!epochInfo.endsAt) { setMsLeft(0); return; }
    const tick = () => setMsLeft(Math.max(0, epochInfo.endsAt - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [epochInfo.endsAt]);

  if (!epochInfo.epoch) return null;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-error/10 border border-error/25 text-xs font-medium ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-error animate-subtle-pulse flex-shrink-0" />
      <span className="text-error font-semibold">Epoch {epochInfo.epoch} is live</span>
      {epochInfo.endsAt > 0 && (
        <>
          <span className="text-border">·</span>
          <span className="text-textSecondary tabular-nums">{formatCountdown(msLeft)}</span>
        </>
      )}
    </div>
  );
};

export default EpochBanner;
