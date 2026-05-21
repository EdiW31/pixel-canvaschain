import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import EpochBanner from './EpochBanner';
import WalletInfo from './WalletInfo';
import { useApp } from '../context/AppContext';

const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS;

/**
 * MarketingNav — full-width flex navbar.
 *
 * Layout: [🎨 logo] [links…] ——————————— [epoch] [wallet] | [theme]
 *
 * Logo is on the far left, nav links sit right beside it, controls
 * are pushed to the far right with ml-auto. Everything is vertically
 * centred inside the 80px tall bar.
 */
const MarketingNav = () => {
  const { wallet, auctionState } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  const isAdmin = wallet.address === ADMIN_ADDRESS;
  const isAuctionLive = !!auctionState?.active;

  const navBg      = isDark ? '#0E0D0B'                : '#FFFFFF';
  const navBorder  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(27,26,23,0.09)';
  const linkClr    = isDark ? 'rgba(255,255,255,0.50)' : 'rgba(27,26,23,0.52)';
  const linkActv   = isDark ? '#E5B547'                : '#B8891E';
  const linkHov    = isDark ? 'rgba(255,255,255,0.92)' : '#1B1A17';
  const logoBg     = isDark ? 'rgba(229,181,71,0.12)'  : 'rgba(229,181,71,0.10)';
  const logoBorder = isDark ? 'rgba(229,181,71,0.30)'  : 'rgba(196,150,40,0.28)';

  const links = [
    { to: '/',        label: 'Home'    },
    { to: '/auction', label: 'Auction', live: isAuctionLive },
    { to: '/canvas',  label: 'Canvas'  },
    { to: '/nft',     label: 'Gallery' },
    { to: '/shop',    label: 'Shop'    },
  ];

  return (
    <>
      <style>{`
        @keyframes live-pulse { 0%,100%{opacity:1} 50%{opacity:0.55} }
      `}</style>

      <nav
        className="flex-shrink-0 sticky top-0 z-40"
        style={{
          background: navBg,
          borderBottom: `1px solid ${navBorder}`,
          transition: 'background 0.4s ease, border-color 0.4s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 80,
            paddingLeft: 24,
            paddingRight: 20,
            width: '100%',
            boxSizing: 'border-box',
            gap: 0,
          }}
        >

          {/* ── Logo badge ─────────────────────────────────────────────── */}
          <button
            onClick={() => navigate('/')}
            title="Home"
            style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: logoBg,
              border: `1.5px solid ${logoBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
              transition: 'background 0.4s, border-color 0.4s, transform 0.15s',
              cursor: 'pointer', outline: 'none', marginRight: 28,
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.07)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            🎨
          </button>

          {/* ── Nav links — sit right after the logo ───────────────────── */}
          <div className="hidden md:flex items-center" style={{ gap: 30 }}>
            {links.map(({ to, label, live }) => (
              <NavRouteLink
                key={to}
                to={to}
                active={location.pathname === to}
                linkColor={linkClr}
                activeColor={linkActv}
                hoverColor={linkHov}
                live={live}
              >
                {label}
              </NavRouteLink>
            ))}
          </div>

          {/* ── Controls — pushed to far right ─────────────────────────── */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <EpochBanner className="hidden lg:inline-flex" />

            {isAdmin && (
              <Link
                to="/admin"
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: '#E5B547', color: '#1B1A17', border: '1px solid rgba(27,26,23,0.20)' }}
              >
                ⚙ Admin
              </Link>
            )}

            {wallet.isConnected ? (
              <WalletInfo />
            ) : (
              <Link
                to="/login"
                className="btn-primary text-sm font-semibold"
                style={{ padding: '7px 22px', borderRadius: 10, whiteSpace: 'nowrap' }}
              >
                Open
              </Link>
            )}

            <div style={{ width: 1, height: 24, background: navBorder, flexShrink: 0, marginLeft: 6 }} />
            <ThemeToggle />
          </div>
        </div>
      </nav>
    </>
  );
};

/* ─── Route-aware link ─────────────────────────────────────────────────────── */
const NavRouteLink = ({ to, active, children, linkColor, activeColor, hoverColor, live }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative py-1 text-sm font-medium tracking-wide whitespace-nowrap inline-flex items-center gap-1.5"
      style={{
        color: active ? activeColor : hovered ? hoverColor : linkColor,
        transition: 'color 0.18s ease',
      }}
    >
      {children}

      {live && (
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '1px 6px', borderRadius: 999,
          background: 'linear-gradient(135deg,#F5C842,#E8872A)',
          color: '#1B1A17', fontSize: 9, fontWeight: 800,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          animation: 'live-pulse 2s ease-in-out infinite',
        }}>
          LIVE
        </span>
      )}

      <span style={{
        position: 'absolute', bottom: -1, left: 0, right: 0,
        height: 1.5, borderRadius: 2, background: activeColor,
        opacity: active ? 1 : 0,
        transform: active ? 'scaleX(1)' : 'scaleX(0)',
        transition: 'opacity 0.22s ease, transform 0.22s ease',
        transformOrigin: 'center',
      }} />
    </Link>
  );
};

export default MarketingNav;
