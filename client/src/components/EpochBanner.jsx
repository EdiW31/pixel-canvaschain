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
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full
        bg-primaryLight border border-primary/50
        shadow-[0_0_12px_rgba(229,181,71,0.25)]
        text-xs font-medium select-none ${className}`}
    >
      {/* Pulsing gold dot */}
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primaryDark" />
      </span>

      {/* Epoch label */}
      <span className="font-semibold text-primaryDark tracking-wide">
        Epoch {epochInfo.epoch}
      </span>

      {/* Separator + countdown */}
      {epochInfo.endsAt > 0 && (
        <>
          <span className="text-primary/40 font-light">|</span>
          <span className="tabular-nums text-primaryDark/80 font-mono text-[11px]">
            {formatCountdown(msLeft)}
          </span>
        </>
      )}
    </div>
  );
};

export default EpochBanner;
