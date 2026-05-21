import { useNavigate } from 'react-router-dom';
import PixelMan from './PixelMan';

/**
 * AuctionFloatingCta — fixed bottom-LEFT pixelman that links to /auction.
 *
 * Used on WelcomePage with section-aware hiding (hide on hero, vote, bidding
 * since each of those already has its own contextual element). Pass
 * `activeSection` from the parent's IntersectionObserver and the list of
 * section IDs to hide on via `hideOnSections`.
 */
const AuctionFloatingCta = ({ hideOnSections = [], activeSection = null }) => {
  const navigate = useNavigate();

  if (activeSection && hideOnSections.includes(activeSection)) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-3 cursor-pointer select-none"
      style={{
        animation:
          'pixelman-enter 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both, ' +
          'pixelman-bob 2.8s ease-in-out 0.55s infinite',
      }}
      onClick={() => navigate('/auction')}
      title="Go to Auction"
    >
      {/* Speech bubble */}
      <div
        className="relative px-4 py-2.5 rounded-2xl shadow-lg"
        style={{
          background: '#FFFFFF',
          border: '2.5px solid #1B1A17',
          transform: 'rotate(3deg)',
          maxWidth: 180,
        }}
      >
        <p className="font-heading font-bold text-sm leading-tight" style={{ color: '#1B1A17' }}>
          🔨 Auction!
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(27,26,23,0.6)' }}>
          Bid on the canvas zone →
        </p>
        {/* Pointer triangle — bottom left corner pointing toward pixelman */}
        <div
          className="absolute"
          style={{
            left: 14,
            bottom: -10,
            width: 14,
            height: 14,
            background: '#FFFFFF',
            borderLeft: '2.5px solid #1B1A17',
            borderBottom: '2.5px solid #1B1A17',
            transform: 'rotate(45deg)',
          }}
        />
      </div>

      <PixelMan px={13} tilt={8} />
    </div>
  );
};

export default AuctionFloatingCta;
