import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import EpochBanner from '../components/EpochBanner';
import { Dot, Stroke, PaintChip, PaletteStrip } from '../components/PaintDecorations';
import { useApp } from '../context/AppContext';
import { useSocket } from '../hooks/useSocket';
import VotingSection from '../components/VotingSection';
import PixelMan from '../components/PixelMan';

/* ─── Pixel art canvas data (24 cols × 13 rows) ──────────────────────────── */
/* eslint-disable no-unused-vars */
const _=null, r='#E53E3E', dr='#C53030', w='#BFDBFE', g='#93C5FD',
      t='#2D3748', hb='#718096', y='#ECC94B',
      B='#4299E1', G='#48BB78', P='#9F7AEA', O='#ED8936',
      sk='#60A5FA', rd='#A0AEC0', K='#ED64A6';
/* eslint-enable no-unused-vars */

const HERO_CANVAS = [
  /* row  0 — sky */         sk,_,_,sk,_,_,_,sk,_,_,sk,_,_,_,sk,_,_,sk,_,_,_,_,sk,_,
  /* row  1 — sky + art */   _,sk,_,_,sk,_,G,G,_,_,_,sk,_,_,sk,_,_,_,P,P,_,_,_,sk,
  /* row  2 — car roof */    _,_,_,_,r,r,r,r,r,r,r,r,r,r,r,r,r,r,_,_,_,_,_,_,
  /* row  3 — windshield */  _,_,r,r,dr,g,g,g,g,g,g,g,g,g,g,dr,r,r,r,_,_,_,_,_,
  /* row  4 — upper body */  r,r,dr,dr,dr,w,w,w,w,w,w,w,w,w,w,dr,dr,dr,r,r,_,_,_,_,
  /* row  5 — body */        r,r,r,r,r,r,r,r,r,r,r,r,r,r,r,r,r,r,r,r,y,_,_,_,
  /* row  6 — lower body */  dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,dr,y,y,_,_,
  /* row  7 — tires */       _,t,t,t,_,_,_,_,_,_,_,_,_,_,_,t,t,t,_,_,_,_,_,_,
  /* row  8 — wheel hubs */  _,t,hb,t,_,_,_,_,_,_,_,_,_,_,_,t,hb,t,_,_,B,B,_,_,
  /* row  9 — road */        rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,rd,
  /* row 10 — road dashes */ rd,rd,_,rd,rd,rd,_,_,_,rd,y,y,y,_,_,_,rd,rd,_,rd,rd,rd,rd,rd,
  /* row 11 — ground art */  G,G,G,_,O,O,_,_,K,K,_,_,P,P,_,_,G,G,_,B,B,_,G,G,
  /* row 12 — bottom strip */G,_,O,O,G,_,B,B,_,K,K,_,_,P,P,_,G,_,O,O,G,_,B,G,
];

const STEP_COLORS = [
  { bg: '#E53E3E', text: '#fff' },
  { bg: '#4299E1', text: '#fff' },
  { bg: '#48BB78', text: '#fff' },
  { bg: '#E5B547', text: '#1B1A17' },
  { bg: '#9F7AEA', text: '#fff' },
];

const CHARITIES = [
  { name: 'Save the Children',       mission: 'Emergency education & medical care for children in conflict zones.', color: '#E53E3E', icon: '🧒' },
  { name: 'UNICEF',                  mission: 'Clean water, vaccines, and nutrition for children worldwide.',       color: '#4299E1', icon: '💧' },
  { name: 'Doctors Without Borders', mission: 'Critical healthcare in regions affected by crisis and disaster.',    color: '#48BB78', icon: '🏥' },
  { name: 'Room to Read',            mission: 'Literacy programs and girls\' education in low-income communities.', color: '#ED8936', icon: '📚' },
  { name: 'Plan International',      mission: 'Ending child marriage and advancing girls\' rights globally.',       color: '#9F7AEA', icon: '✊' },
];

/* ─── Smooth scroll helper ───────────────────────────────────────────────── */
const scrollTo = (id) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/* ─── WelcomePage ────────────────────────────────────────────────────────── */
const WelcomePage = () => {
  const { epochInfo, votingState, totalDonatedEgld } = useApp();
  const { liveStats } = useSocket();
  const navRef = useRef(null);
  const [activeSection, setActiveSection] = useState('hero');
  const [isDark, setIsDark] = useState(false);

  // Detect dark/light theme
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  // Track the most-visible section to drive the nav colour
  useEffect(() => {
    const ids = ['hero','vote','mission','how-it-works','epochs','charity','bidding','nft','split','cta'];
    const ratios = {};
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { ratios[e.target.id] = e.intersectionRatio; });
      const best = Object.entries(ratios).sort(([,a],[,b]) => b - a)[0];
      if (best && best[1] > 0) setActiveSection(best[0]);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [epochInfo.epoch]);

  useLayoutEffect(() => {
    const update = () => {
      const h = navRef.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty('--section-h', `${window.innerHeight - h}px`);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── Nav colour tokens ────────────────────────────────────────────────────────
  const isVoteSec = activeSection === 'vote';
  let navBg, navLinkClr, navLinkActv, navLinkHov, navBorderClr, navCircBorder, navLogoClr, navBrandClr, navSubClr;
  if (isVoteSec) {
    // Vote section → deep sage green, always (even in dark mode)
    navBg        = '#7A9470';
    navLinkClr   = 'rgba(255,255,255,0.70)';
    navLinkActv  = '#fff';
    navLinkHov   = '#fff';
    navBorderClr = 'rgba(0,0,0,0.10)';
    navCircBorder= 'rgba(255,255,255,0.40)';
    navLogoClr   = '#fff';
    navBrandClr  = '#fff';
    navSubClr    = 'rgba(255,255,255,0.55)';
  } else if (!isDark) {
    // Light mode, non-vote → white navbar
    navBg        = '#FFFFFF';
    navLinkClr   = 'rgba(27,26,23,0.52)';
    navLinkActv  = '#C49628';
    navLinkHov   = '#1B1A17';
    navBorderClr = 'rgba(27,26,23,0.10)';
    navCircBorder= 'rgba(27,26,23,0.20)';
    navLogoClr   = '#1B1A17';
    navBrandClr  = '#1B1A17';
    navSubClr    = 'rgba(27,26,23,0.40)';
  } else {
    // Dark mode, non-vote → dark navbar
    navBg        = '#131210';
    navLinkClr   = 'rgba(255,255,255,0.52)';
    navLinkActv  = '#E5B547';
    navLinkHov   = 'rgba(255,255,255,0.92)';
    navBorderClr = 'rgba(255,255,255,0.08)';
    navCircBorder= 'rgba(255,255,255,0.30)';
    navLogoClr   = '#fff';
    navBrandClr  = '#fff';
    navSubClr    = 'rgba(255,255,255,0.38)';
  }

  return (
  <div className="h-screen flex flex-col overflow-hidden bg-background text-textPrimary">

    {/* ─── Nav ─────────────────────────────────────────────────────── */}
    <nav
      ref={navRef}
      className="flex-shrink-0 z-40"
      style={{
        background: navBg,
        borderBottom: `1px solid ${navBorderClr}`,
        position: 'relative',
        transition: 'background 0.45s ease, border-color 0.45s ease',
      }}
    >
      <div
        className="max-w-6xl mx-auto flex items-center justify-between"
        style={{ height: 82, paddingLeft: 112, paddingRight: 32, position: 'relative' }}
      >
        {/* Circle logo — half protrudes below nav bottom */}
        <button
          onClick={() => scrollTo('hero')}
          title="Home"
          style={{
            position: 'absolute', left: 32, bottom: -28,
            width: 56, height: 56, borderRadius: '50%',
            background: navBg,
            border: `2px solid ${navCircBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: navLogoClr,
            zIndex: 20,
            boxShadow: '0 4px 20px rgba(0,0,0,0.16)',
            transition: 'background 0.45s ease, border-color 0.45s ease, color 0.45s ease',
            cursor: 'pointer',
          }}
        >
          🎨
        </button>

        {/* Brand name */}
        <button onClick={() => scrollTo('hero')} className="hidden sm:flex flex-col text-left flex-shrink-0">
          <div className="font-heading text-[16px] font-semibold tracking-tight" style={{ color: navBrandClr, transition: 'color 0.45s ease' }}>
            Pixel CanvasChain
          </div>
          <div className="text-[11px] tracking-widest uppercase" style={{ color: navSubClr, transition: 'color 0.45s ease' }}>
            Painting for a cause
          </div>
        </button>

        {/* Center nav links */}
        <div className="flex items-center gap-7">
          <NavLink sectionId="mission"   linkColor={navLinkClr} activeColor={navLinkActv} hoverColor={navLinkHov}>Mission</NavLink>
          <HowItWorksNavLinks            linkColor={navLinkClr} activeColor={navLinkActv} hoverColor={navLinkHov} />
          <NavLink sectionId="nft"       linkColor={navLinkClr} activeColor={navLinkActv} hoverColor={navLinkHov}>NFT</NavLink>
          <NavLink sectionId="split"     linkColor={navLinkClr} activeColor={navLinkActv} hoverColor={navLinkHov}>The Split</NavLink>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-5">
          <EpochBanner className="hidden md:inline-flex" />
          <ThemeToggle />
          <Link to="/login" className="btn-primary px-5 py-2 text-sm">Open the app</Link>
        </div>
      </div>
    </nav>

    {/* ─── Scroll container (smooth, no snap) ──────────────────────── */}
    <div
      className="flex-1 min-h-0 overflow-y-scroll"
      style={{ scrollbarWidth: 'thin', scrollBehavior: 'smooth' }}
    >

      {/* ── 1. Hero ───────────────────────────────────────────────── */}
      <AnimatedSection
        id="hero"
        className="flex items-center relative overflow-hidden"
        style={{ height: 'var(--section-h, 100vh)' }}
      >
        <Dot color="#E53E3E" style={{ top: 24,    left:  '1%'   }} />
        <Dot color="#4299E1" style={{ top: 70,    left:  '1.5%' }} />
        <Dot color="#48BB78" style={{ bottom: 70, left:  '2%'   }} />
        <Dot color="#ED64A6" style={{ bottom: 30, left:  '1%'   }} />
        <Dot color="#9F7AEA" style={{ top: 40,    right: '1%'   }} />
        <Dot color="#ED8936" style={{ top: 90,    right: '1.5%' }} />
        <Dot color="#ECC94B" style={{ bottom: 60, right: '1%'   }} />
        <Dot color="#E53E3E" style={{ bottom: 20, right: '2%'   }} />
        <Dot color="#48BB78" style={{ top: 15,    left:  '48%'  }} />
        <Dot color="#4299E1" style={{ bottom: 15, left:  '52%'  }} />

        {/* Pixelman vote CTA — bottom-right corner; message changes after voting */}
        {epochInfo.epoch > 0 && (
          <button
            onClick={() => scrollTo('vote')}
            className="absolute z-20 flex items-end gap-3 group select-none"
            style={{ bottom: '6%', right: '6%' }}
            aria-label={votingState.hasVoted ? 'See voting results' : 'Go to voting section'}
          >
            {/* Speech bubble — theme-aware; sage tint when voted, gold when pending */}
            <div
              className={`relative bg-surface border-2 rounded-2xl px-4 py-3 group-hover:-translate-y-1 transition-all duration-200 mb-2 ${
                votingState.hasVoted
                  ? 'border-charity shadow-[0_4px_20px_rgba(123,158,93,0.45)] group-hover:shadow-[0_6px_28px_rgba(123,158,93,0.65)]'
                  : 'border-primary shadow-[0_4px_20px_rgba(229,181,71,0.45)] group-hover:shadow-[0_6px_28px_rgba(229,181,71,0.65)]'
              }`}
            >
              <p className="text-xs font-bold text-textPrimary leading-snug whitespace-nowrap">
                {votingState.hasVoted
                  ? `✓ You voted for epoch ${epochInfo.epoch}!`
                  : `🗳 Vote for epoch ${epochInfo.epoch}!`}
              </p>
              <p className="text-[10px] text-textSecondary mt-0.5 whitespace-nowrap">
                {votingState.hasVoted ? 'See the live results ↓' : 'Scroll down to pick a charity →'}
              </p>
              {/* Tail — rotated square trick, matches border colour */}
              <div
                className={`absolute -right-2 bottom-4 w-3 h-3 bg-surface border-r-2 border-b-2 rotate-45 ${
                  votingState.hasVoted ? 'border-charity' : 'border-primary'
                }`}
              />
            </div>
            {/* Pixel mascot */}
            <PixelManBig />
          </button>
        )}

        <div className="max-w-6xl mx-auto px-6 py-8 w-full">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <span className="pill-charity mb-4 inline-flex">
                <span>♥</span> 50% to charity — enforced on-chain
              </span>
              <h1 className="font-heading text-4xl sm:text-5xl xl:text-6xl font-semibold tracking-tighter leading-[1.05] mb-4">
                A million pixels.<br />
                <span className="italic text-primaryDark">One shared canvas.</span><br />
                For children who need it most.
              </h1>
              <p className="text-base sm:text-lg text-textSecondary leading-relaxed mb-6">
                Collaborative pixel art on MultiversX blockchain. Buy credits, paint on a public canvas, and watch{' '}
                <strong className="text-textPrimary font-semibold">half of every cent</strong>{' '}
                flow automatically to child-welfare organisations.
              </p>
              <div className="flex flex-wrap gap-3 mb-7">
                <Link to="/login" className="btn-primary-lg">Start painting →</Link>
                <button onClick={() => scrollTo('mission')} className="btn-secondary">How it works ↓</button>
              </div>
              <div className="grid grid-cols-3 gap-6 max-w-sm">
                <Stat label="Pixels"    value="1M" />
                <Stat label="To charity" value="50%" emphasis />
                <Stat label="On-chain"  value="100%" />
              </div>
            </div>

            <div className="hidden lg:block">
              <HeroCanvasPreview onlineUsers={liveStats?.onlineUsers} />
            </div>
          </div>
        </div>

      </AnimatedSection>

      {/* ── 2. Voting section ────────────────────────────────────── */}
      {epochInfo.epoch > 0 && (
        <AnimatedSection
          id="vote"
          data-theme="light"
          className="flex items-center relative overflow-hidden border-t-2 bg-primary"
          style={{ height: 'var(--section-h, 100vh)', borderColor: 'rgba(0,0,0,0.08)' }}
        >
          <Dot color="#E53E3E" style={{ top: 24,    left:  '2%'   }} />
          <Dot color="#4299E1" style={{ top: 60,    right: '2%'   }} />
          <Dot color="#48BB78" style={{ bottom: 30, left:  '4%'   }} />
          <Dot color="#9F7AEA" style={{ bottom: 60, right: '3%'   }} />

          {/* Big tilted pixelman on the RIGHT — always visible, message changes after vote */}
          <div
            className="hidden xl:flex absolute pointer-events-none select-none"
            style={{ right: '2%', top: votingState.hasVoted ? '55%' : '20%', zIndex: 5, animation: 'pixelman-bob 3s ease-in-out infinite', display: 'flex', alignItems: 'flex-end', gap: 16 }}
          >
            <div
              className="relative mb-8"
              style={{
                background: '#FFFFFF',
                border: '2.5px solid #1B1A17',
                borderRadius: 20,
                padding: '14px 20px',
                transform: 'rotate(6deg)',
                boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
                maxWidth: 220,
              }}
            >
              <p className="font-heading font-bold text-base leading-tight" style={{ color: '#1B1A17' }}>
                {votingState.hasVoted ? 'Voted! ✓' : 'Hey! Pick one!'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(27,26,23,0.65)' }}>
                {votingState.hasVoted
                  ? 'Thanks for voting this epoch 🎨'
                  : 'Your vote sends real EGLD to the charity 🎨'}
              </p>
              <div
                className="absolute"
                style={{
                  right: -10, bottom: 18, width: 16, height: 16,
                  background: '#FFFFFF',
                  borderRight: '2.5px solid #1B1A17',
                  borderBottom: '2.5px solid #1B1A17',
                  transform: 'rotate(-45deg)',
                }}
              />
            </div>
            <PixelMan px={14} tilt={22} />
          </div>

          <div className="max-w-5xl mx-auto px-6 py-8 w-full">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border-2 text-sm font-bold mb-4"
                style={{ borderColor: 'rgba(27,26,23,0.3)', color: '#1B1A17', background: 'rgba(255,255,255,0.25)' }}>
                🗳 Community Vote · Epoch {epochInfo.epoch}
              </div>
              <h2 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight mb-2"
                style={{ color: '#1B1A17' }}>
                You decide where the EGLD goes.
              </h2>
              <p className="text-base max-w-xl" style={{ color: 'rgba(27,26,23,0.7)' }}>
                Every epoch, the community votes on which charity receives the accumulated donations. One wallet, one vote — enforced on-chain.
              </p>
            </div>

            <VotingSection onYellow />
          </div>
        </AnimatedSection>
      )}

      {/* ── 3. Mission ────────────────────────────────────────────── */}
      <AnimatedSection
        id="mission"
        className="bg-backgroundAlt border-t border-border flex items-center relative overflow-hidden"
        style={{ height: 'var(--section-h, 100vh)' }}
        scrollTarget="how-it-works"
      >
        <Dot color="#E53E3E" style={{ top: 16,    left:  '2%'  }} />
        <Dot color="#4299E1" style={{ top: 40,    right: '3%'  }} />
        <Dot color="#48BB78" style={{ bottom: 20, left:  '55%' }} />
        <Dot color="#9F7AEA" style={{ top: 70,    right: '18%' }} />
        <Dot color="#ECC94B" style={{ bottom: 40, left:  '8%'  }} />
        <Dot color="#ED64A6" style={{ top: 24,    left:  '45%' }} />
        <Dot color="#ED8936" style={{ bottom: 16, right: '30%' }} />

        <div className="max-w-5xl mx-auto px-6 py-8 w-full">
          <div className="mb-4">
            <div className="pill mb-2">Why we built this</div>
            <h2 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight">
              A blockchain r/place — with a purpose.
            </h2>
            <Stroke />
          </div>

          <div className="relative w-full h-32 sm:h-40 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface shadow-card mb-4">
            <div className="absolute top-2 left-2 grid grid-cols-8 gap-[3px]" aria-hidden="true">
              {['#E53E3E','#ED8936','#ECC94B','#48BB78','#4299E1','#9F7AEA','#ED64A6','#E53E3E',
                '#ED8936','#ECC94B','#48BB78','#4299E1','#9F7AEA','#ED64A6','#E53E3E','#ED8936'].map((c,i) => (
                <div key={i} style={{ width:6,height:6,background:c,borderRadius:1,opacity:0.5 }} />
              ))}
            </div>
            <div className="absolute bottom-2 right-2 grid grid-cols-8 gap-[3px]" aria-hidden="true">
              {['#4299E1','#9F7AEA','#ED64A6','#E53E3E','#ECC94B','#48BB78','#ED8936','#4299E1',
                '#9F7AEA','#ED64A6','#E53E3E','#ED8936','#48BB78','#ECC94B','#4299E1','#9F7AEA'].map((c,i) => (
                <div key={i} style={{ width:6,height:6,background:c,borderRadius:1,opacity:0.5 }} />
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <div className="w-11 h-11 rounded-xl bg-backgroundAlt border border-border flex items-center justify-center text-2xl shadow-soft">🖼️</div>
              <p className="text-sm font-medium text-textSecondary">Mission image · 4:3</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="rounded-xl px-5 py-4 border border-primary/40" style={{ background: 'rgb(var(--primary) / 0.08)' }}>
              <span className="inline-flex items-center gap-1.5 font-semibold text-primaryDark text-base mb-2">
                🎨 The idea: Reddit r/place, on-chain.
              </span>
              <p className="text-base text-textSecondary leading-relaxed">
                When Reddit launched <strong className="text-textPrimary">r/place</strong> — a million-pixel canvas where anyone painted one pixel every 5 minutes — millions stayed up defending their art. We built the same thing, but permanent, decentralised, and charitable.
              </p>
            </div>
            <div className="space-y-3 text-base text-textSecondary leading-relaxed">
              <p>
                Every pixel purchase triggers an automatic{' '}
                <strong className="text-textPrimary">on-chain donation</strong> — the split happens inside the same transaction, no promises needed.
              </p>
              <p>
                Designed to grow into a <strong className="text-textPrimary">marketplace of causes</strong>: NGOs list missions, the community selects the epoch's charity, funds route automatically.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <PaintChip color="#48BB78" label="50% → Charity" />
                <PaintChip color="#E5B547" label="25% → Platform" />
                <PaintChip color="#9B978F" label="25% → Burn" />
              </div>
            </div>
          </div>
        </div>

      </AnimatedSection>

      {/* ── 3. How it works ───────────────────────────────────────── */}
      <AnimatedSection
        id="how-it-works"
        className="border-t border-border flex items-center relative overflow-hidden"
        style={{ height: 'var(--section-h, 100vh)' }}
        scrollTarget="epochs"
      >
        <Dot color="#E53E3E" style={{ top: 18,    left:  '5%'  }} />
        <Dot color="#4299E1" style={{ top: 55,    right: '4%'  }} />
        <Dot color="#48BB78" style={{ bottom: 28, left:  '12%' }} />
        <Dot color="#ECC94B" style={{ top: 30,    left:  '25%' }} />
        <Dot color="#9F7AEA" style={{ bottom: 50, right: '12%' }} />
        <Dot color="#ED64A6" style={{ top: 12,    right: '35%' }} />
        <Dot color="#ED8936" style={{ bottom: 18, left:  '45%' }} />
        <Dot color="#E53E3E" style={{ top: 80,    right: '25%' }} />

        <div className="max-w-5xl mx-auto px-6 py-8 w-full">
          <div className="text-center mb-7">
            <div className="pill mb-2">How it works</div>
            <h2 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight">
              Five steps from wallet to canvas to charity
            </h2>
            <div className="flex justify-center"><Stroke color="#4299E1" /></div>
          </div>
          <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Step n="1" color={STEP_COLORS[0]} title="Connect wallet"
              body="Any MultiversX wallet — DeFi extension, xPortal, Ledger, or Web Wallet. No sign-up forms." />
            <Step n="2" color={STEP_COLORS[1]} title="Buy credits"
              body="Pick a tier. Pay in EGLD. 50% auto-routes to charity on the same transaction." />
            <Step n="3" color={STEP_COLORS[2]} title="Paint"
              body="Spend a credit, place a pixel. Real-time, collaborative, and forever indexed on-chain." />
            <Step n="4" color={STEP_COLORS[3]} title="Epoch ends"
              body="The community's spending unlocks the selected charity. Funds flow automatically on-chain." />
            <Step n="5" color={STEP_COLORS[4]} title="Win NFT"
              body="The biggest contributor of the epoch wins a unique generative NFT — no claiming needed." />
          </div>
        </div>

      </AnimatedSection>

      {/* ── 4. Epochs ─────────────────────────────────────────────── */}
      <AnimatedSection
        id="epochs"
        className="bg-backgroundAlt border-t border-border flex items-center relative overflow-hidden"
        style={{ height: 'var(--section-h, 100vh)' }}
        scrollTarget="charity"
      >
        <Dot color="#E53E3E" style={{ top: 22,    left:  '3%'  }} />
        <Dot color="#ED8936" style={{ top: 60,    right: '5%'  }} />
        <Dot color="#ECC94B" style={{ bottom: 30, left:  '20%' }} />
        <Dot color="#48BB78" style={{ top: 40,    left:  '38%' }} />
        <Dot color="#4299E1" style={{ bottom: 20, right: '22%' }} />
        <Dot color="#9F7AEA" style={{ top: 15,    right: '40%' }} />
        <Dot color="#ED64A6" style={{ bottom: 55, left:  '60%' }} />
        <Dot color="#E53E3E" style={{ top: 90,    left:  '10%' }} />

        <div className="max-w-5xl mx-auto px-6 py-8 w-full">
          <div className="text-center mb-6">
            <div className="pill mb-2">Epoch system</div>
            <h2 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight">
              One week. One charity. One NFT winner.
            </h2>
            <div className="flex justify-center"><Stroke color="#ED8936" /></div>
          </div>

          <div className="relative mb-7">
            <div className="absolute top-7 left-0 right-0 h-0.5 bg-border hidden md:block" aria-hidden="true" />
            <div className="grid md:grid-cols-4 gap-5 relative">
              <EpochPhase icon="🗳️" color="#4299E1" label="Day 1"      title="Epoch opens"     body="5 charities announced. NFT design revealed. Bidding opens for the locked zone." />
              <EpochPhase icon="🎨" color="#48BB78" label="Days 2–6"   title="Community paints" body="Every purchase adds to the charity pot and climbs the leaderboard." />
              <EpochPhase icon="🏆" color="#E5B547" label="Day 7"      title="Epoch closes"    body="Leaderboard freezes. The charity with most credit-votes wins." />
              <EpochPhase icon="✨" color="#9F7AEA" label="Settlement"  title="On-chain payout" body="Funds transfer. Top painter gets NFT. New epoch opens immediately." />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <EpochStat icon="📅" label="Epoch length"   value="7 days"        sub="Fixed, on-chain enforced"            color="#4299E1" />
            <EpochStat icon="🎗️" label="Charities"      value="5 candidates"  sub="Community allocates credits to vote"  color="#48BB78" />
            <EpochStat icon="🖼️" label="NFT reward"     value="1 unique mint"  sub="Awarded to the top pixel painter"    color="#9F7AEA" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <EpochStat icon="💰" label="Total donated"
              value={totalDonatedEgld != null ? `${totalDonatedEgld.toFixed(4)} EGLD` : '—'}
              sub="Accumulated across all epochs"
              color="#ED8936" />
            <EpochStat icon="🎨" label="Pixels painted"
              value={liveStats?.totalPixels?.toLocaleString() ?? '—'}
              sub="Live canvas activity"
              color="#ED64A6" />
          </div>
        </div>

      </AnimatedSection>

      {/* ── 5. Charity of the Epoch ───────────────────────────────── */}
      <AnimatedSection
        id="charity"
        className="border-t border-border flex items-center relative overflow-hidden"
        style={{ height: 'var(--section-h, 100vh)' }}
        scrollTarget="bidding"
      >
        <Dot color="#48BB78" style={{ top: 18,    left:  '4%'  }} />
        <Dot color="#E53E3E" style={{ top: 50,    right: '6%'  }} />
        <Dot color="#4299E1" style={{ bottom: 25, left:  '15%' }} />
        <Dot color="#ECC94B" style={{ top: 30,    left:  '32%' }} />
        <Dot color="#9F7AEA" style={{ bottom: 40, right: '20%' }} />
        <Dot color="#ED8936" style={{ top: 14,    right: '38%' }} />
        <Dot color="#ED64A6" style={{ bottom: 16, left:  '52%' }} />

        <div className="max-w-5xl mx-auto px-6 py-8 w-full">
          <div className="text-center mb-5">
            <div className="pill-charity mb-2">This epoch's charities</div>
            <h2 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight">
              Five causes. You decide where the money goes.
            </h2>
            <div className="flex justify-center"><Stroke color="#48BB78" /></div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {CHARITIES.map((c, i) => (
              <CharityCard key={c.name} charity={c} isHighlighted={i === 0} votePct={[38,22,18,12,8][i]} />
            ))}
            <div className="card p-4 border-dashed flex flex-col items-center justify-center gap-2 text-center min-h-[110px]">
              <div className="w-8 h-8 rounded-xl bg-backgroundAlt border border-border flex items-center justify-center text-lg">＋</div>
              <div>
                <p className="text-sm font-semibold text-textPrimary">Submit a charity</p>
                <p className="text-xs text-textMuted mt-0.5">Any registered NGO — coming soon</p>
              </div>
            </div>
          </div>

          <div className="card p-4 bg-backgroundAlt flex items-start gap-3">
            <div className="text-xl flex-shrink-0">ℹ️</div>
            <p className="text-sm text-textSecondary leading-relaxed">
              When you buy credits, you assign them to a charity. The one with the most credits at epoch end receives{' '}
              <strong className="text-textPrimary">100% of the charitable pot</strong>. Your spend is your vote.
            </p>
          </div>
        </div>

      </AnimatedSection>

      {/* ── 6. Bidding ────────────────────────────────────────────── */}
      <AnimatedSection
        id="bidding"
        className="bg-backgroundAlt border-t border-border flex items-center relative overflow-hidden"
        style={{ height: 'var(--section-h, 100vh)' }}
        scrollTarget="nft"
      >
        <Dot color="#E53E3E" style={{ top: 20,    left:  '2%'  }} />
        <Dot color="#ED8936" style={{ top: 55,    right: '3%'  }} />
        <Dot color="#ECC94B" style={{ bottom: 30, left:  '8%'  }} />
        <Dot color="#48BB78" style={{ top: 35,    left:  '35%' }} />
        <Dot color="#4299E1" style={{ bottom: 50, right: '10%' }} />
        <Dot color="#9F7AEA" style={{ top: 15,    right: '42%' }} />
        <Dot color="#ED64A6" style={{ bottom: 18, left:  '55%' }} />
        <Dot color="#E53E3E" style={{ top: 80,    right: '22%' }} />

        <div className="max-w-5xl mx-auto px-6 py-8 w-full">
          <div className="text-center mb-5">
            <div className="pill mb-2">Bidding</div>
            <h2 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight">
              Bid for the epoch's prime 50×50 zone.
            </h2>
            <div className="flex justify-center"><Stroke color="#E53E3E" /></div>
            <p className="text-textSecondary mt-1 max-w-xl mx-auto text-base">
              At the start of every epoch, a <strong className="text-textPrimary">50×50 pixel zone</strong> is locked.
              Painting pauses for the first day while wallets compete. Highest EGLD bid wins exclusive rights for the whole epoch.
            </p>
          </div>
          <BiddingPreview />
        </div>

      </AnimatedSection>

      {/* ── 7. NFT Rewards ────────────────────────────────────────── */}
      <AnimatedSection
        id="nft"
        className="border-t border-border flex items-center relative overflow-hidden"
        style={{ height: 'var(--section-h, 100vh)' }}
        scrollTarget="split"
      >
        <Dot color="#9F7AEA" style={{ top: 20,    left:  '3%'  }} />
        <Dot color="#E53E3E" style={{ top: 55,    right: '4%'  }} />
        <Dot color="#4299E1" style={{ bottom: 30, left:  '10%' }} />
        <Dot color="#ECC94B" style={{ top: 35,    left:  '28%' }} />
        <Dot color="#48BB78" style={{ bottom: 50, right: '15%' }} />
        <Dot color="#ED8936" style={{ top: 12,    right: '32%' }} />
        <Dot color="#ED64A6" style={{ bottom: 20, left:  '58%' }} />
        <Dot color="#9F7AEA" style={{ top: 75,    right: '20%' }} />

        <div className="max-w-5xl mx-auto px-6 py-8 w-full">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="pill mb-2">NFT Rewards</div>
              <h2 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight mb-2">
                Paint the most. Win a one-of-a-kind NFT.
              </h2>
              <Stroke color="#9F7AEA" />
              <p className="text-textSecondary leading-relaxed mb-5 text-base">
                At epoch end, the wallet that spent the most credits receives a{' '}
                <strong className="text-textPrimary">unique generative NFT</strong> minted directly to their address —
                no claiming transaction, fully automatic.
              </p>
              <ul className="space-y-2.5 text-base text-textSecondary">
                <NftFeature color="#E53E3E" text="One NFT per epoch — never repeated, never duplicated." />
                <NftFeature color="#4299E1" text="Generative art derived from the epoch's canvas snapshot." />
                <NftFeature color="#48BB78" text="Automatically airdropped — no claim transaction needed." />
                <NftFeature color="#9F7AEA" text="Epoch number, charity name, and top-painter address in metadata." />
              </ul>
            </div>
            <div className="flex flex-col items-center gap-3">
              <NftMockup />
              <div className="text-center">
                <p className="text-sm font-semibold text-textPrimary">Epoch #1 NFT — Example</p>
                <p className="text-xs text-textMuted mt-0.5">Generated from the epoch's canvas snapshot</p>
              </div>
            </div>
          </div>
        </div>

      </AnimatedSection>

      {/* ── 8. Split & Tiers ──────────────────────────────────────── */}
      <AnimatedSection
        id="split"
        className="bg-backgroundAlt border-t border-border flex items-center relative overflow-hidden"
        style={{ height: 'var(--section-h, 100vh)' }}
        scrollTarget="cta"
      >
        <Dot color="#48BB78" style={{ top: 18,    left:  '2%'  }} />
        <Dot color="#9F7AEA" style={{ top: 50,    right: '4%'  }} />
        <Dot color="#E53E3E" style={{ bottom: 28, left:  '14%' }} />
        <Dot color="#ECC94B" style={{ top: 28,    left:  '30%' }} />
        <Dot color="#4299E1" style={{ bottom: 45, right: '18%' }} />
        <Dot color="#ED8936" style={{ top: 14,    right: '35%' }} />
        <Dot color="#ED64A6" style={{ bottom: 16, left:  '52%' }} />
        <Dot color="#48BB78" style={{ top: 70,    right: '28%' }} />

        <div className="max-w-5xl mx-auto px-6 py-8 w-full">
          <div className="grid md:grid-cols-2 gap-10">
            <div>
              <div className="pill-charity mb-2">The split</div>
              <h2 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight mb-2">
                Where every coin actually goes
              </h2>
              <Stroke color="#48BB78" />
              <p className="text-base text-textSecondary mb-4 leading-relaxed">
                The smart contract enforces this on every single purchase — no one can change it without redeploying.
              </p>
              <div className="flex w-full h-10 rounded-lg overflow-hidden shadow-soft mb-5">
                <div className="bg-charity flex items-center justify-center text-white font-semibold text-xs" style={{ width:'50%' }}>50% → Charity</div>
                <div className="bg-primary flex items-center justify-center font-semibold text-xs" style={{ width:'25%', color:'#1B1A17' }}>25% → Owner</div>
                <div className="bg-textMuted flex items-center justify-center text-white font-semibold text-xs" style={{ width:'25%' }}>25% → Burn</div>
              </div>
              <div className="space-y-3">
                <SplitItem color="bg-charity"   title="Charity (50%)"  body="Routes automatically to the winning charity wallet at epoch settlement." />
                <SplitItem color="bg-primary"   title="Platform (25%)" body="Covers servers, front-end, and ongoing development." />
                <SplitItem color="bg-textMuted" title="Burn (25%)"     body="Sent to an unspendable address — permanently reducing supply." />
              </div>
            </div>

            <div>
              <div className="pill mb-2">Pricing</div>
              <h2 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight mb-2">
                Five tiers of pixels
              </h2>
              <Stroke color="#9F7AEA" />
              <div className="flex flex-col gap-2 mt-1">
                <TierRow name="Novice"     egld="0.05" pixels="1,000"  bonus={null}  dot="#9F7AEA" />
                <TierRow name="Apprentice" egld="0.25" pixels="5,500"  bonus="+10%" dot="#4299E1" />
                <TierRow name="Artisan"    egld="0.50" pixels="12,000" bonus="+20%" dot="#48BB78" />
                <TierRow name="Master"     egld="1.25" pixels="32,500" bonus="+30%" dot="#ED8936" />
                <TierRow name="Legend"     egld="2.50" pixels="75,000" bonus="+50%" dot="#E53E3E" featured />
              </div>
              <p className="text-xs text-textMuted mt-3">Devnet values — mainnet pricing scales proportionally.</p>
            </div>
          </div>
        </div>

      </AnimatedSection>

      {/* ── 9. CTA + Footer ───────────────────────────────────────── */}
      <AnimatedSection
        id="cta"
        className="border-t border-border flex flex-col relative overflow-hidden"
        style={{ height: 'var(--section-h, 100vh)' }}
      >
        <Dot color="#E53E3E" style={{ top: 20,    left:  '5%'  }} />
        <Dot color="#4299E1" style={{ top: 50,    right: '8%'  }} />
        <Dot color="#48BB78" style={{ bottom: 80, left:  '12%' }} />
        <Dot color="#9F7AEA" style={{ bottom: 50, right: '5%'  }} />
        <Dot color="#ED8936" style={{ top: 80,    left:  '18%' }} />
        <Dot color="#ECC94B" style={{ top: 35,    right: '25%' }} />
        <Dot color="#ED64A6" style={{ bottom: 30, left:  '40%' }} />
        <Dot color="#4299E1" style={{ top: 110,   right: '40%' }} />

        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <h2 className="font-heading text-3xl sm:text-5xl font-semibold tracking-tight mb-4">
            Ready to paint something<br className="hidden sm:block" /> that matters?
          </h2>
          <div className="flex justify-center mb-5"><Stroke /></div>
          <p className="text-lg text-textSecondary mb-8">
            Help a child. Win an NFT. Leave your mark on a million-pixel canvas.
          </p>
          <Link to="/login" className="btn-primary-lg">Open the canvas →</Link>
        </div>

        <footer className="flex-shrink-0 border-t border-border bg-backgroundAlt">
          <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-textMuted">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-xs">🎨</div>
              <span>Pixel CanvasChain</span>
              <PaletteStrip size={8} />
            </div>
            <div className="flex items-center gap-6">
              <a href="https://devnet-explorer.multiversx.com" target="_blank" rel="noopener noreferrer"
                className="hover:text-textPrimary transition-colors">MultiversX Explorer ↗</a>
              <span>Built on MultiversX</span>
            </div>
          </div>
        </footer>
      </AnimatedSection>

    </div>{/* end scroll container */}
  </div>
  );
};

/* ─── NavButton — nav item with gold underline when section is in view ────── */
/* ─── Pixel mascot (bigger scale for hero corner) ───────────────────────── */
const M_X=null, M_G='#E5B547', M_GD='#C49628', M_SK='#FDE68A', M_EY='#1A1817', M_RD='#E05A4B', M_BL='#3B82F6', M_BK='#1A1817';
const MASCOT_BIG = [
  [M_X,  M_X,  M_GD, M_GD, M_GD, M_GD, M_X,  M_X  ],
  [M_X,  M_GD, M_G,  M_G,  M_G,  M_G,  M_GD, M_X  ],
  [M_X,  M_X,  M_SK, M_SK, M_SK, M_SK, M_X,  M_X  ],
  [M_X,  M_X,  M_SK, M_EY, M_SK, M_EY, M_SK, M_X  ],
  [M_X,  M_X,  M_SK, M_SK, M_SK, M_SK, M_X,  M_X  ],
  [M_SK, M_RD, M_RD, M_RD, M_RD, M_RD, M_RD, M_SK ],
  [M_X,  M_RD, M_RD, M_RD, M_RD, M_RD, M_X,  M_X  ],
  [M_X,  M_X,  M_BL, M_BL, M_X,  M_BL, M_BL, M_X  ],
  [M_X,  M_X,  M_BL, M_BL, M_X,  M_BL, M_BL, M_X  ],
  [M_X,  M_X,  M_BK, M_BK, M_X,  M_BK, M_BK, M_X  ],
  [M_X,  M_X,  M_BK, M_X,  M_X,  M_X,  M_BK, M_X  ],
];
const PX_BIG = 7;
const PixelManBig = () => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(8, ${PX_BIG}px)`,
      gridTemplateRows: `repeat(11, ${PX_BIG}px)`,
      imageRendering: 'pixelated',
      flexShrink: 0,
      filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.25))',
      transition: 'transform 0.2s',
    }}
    className="group-hover:scale-110 group-hover:-translate-y-1"
  >
    {MASCOT_BIG.flat().map((color, i) => (
      <div key={i} style={{ width: PX_BIG, height: PX_BIG, backgroundColor: color ?? 'transparent' }} />
    ))}
  </div>
);

/* ─── NavLink — colour-aware nav button (used in the WelcomePage navbar) ──── */
const NavLink = ({ sectionId, children, linkColor, activeColor, hoverColor }) => {
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [sectionId]);
  return (
    <button
      onClick={() => scrollTo(sectionId)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hidden sm:inline-flex relative py-1 text-sm font-medium tracking-wide"
      style={{ color: active ? activeColor : hovered ? hoverColor : linkColor, transition: 'color 0.2s ease' }}
    >
      {children}
      <span style={{ position:'absolute', bottom:-1, left:0, right:0, height:1.5, borderRadius:2, background: activeColor, transition:'opacity 0.25s ease, transform 0.25s ease', opacity: active ? 1 : 0, transform: active ? 'scaleX(1)' : 'scaleX(0)', transformOrigin:'center' }} />
    </button>
  );
};

/* ─── HowItWorksNavLinks — colour-aware cycling nav with dot indicators ──── */
const HowItWorksNavLinks = ({ linkColor, activeColor, hoverColor }) => {
  const [step, setStep] = useState(-1);
  const [hovered, setHovered] = useState(false);
  const sections = ['how-it-works', 'epochs', 'charity', 'bidding'];
  useEffect(() => {
    const visible = new Set();
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id); });
      setStep(sections.findIndex(id => visible.has(id)));
    }, { threshold: 0.5 });
    sections.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);
  const isActive = step >= 0;
  const handleClick = () => { const next = (step + 1) % sections.length; scrollTo(sections[next]); };
  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hidden sm:inline-flex items-center gap-2 text-sm font-medium tracking-wide whitespace-nowrap"
      style={{ color: isActive ? activeColor : hovered ? hoverColor : linkColor, transition: 'color 0.2s ease' }}
    >
      How it works
      <span className="flex items-center gap-1" aria-hidden="true">
        {sections.map((_, i) => (
          <span key={i} style={{ display:'inline-block', width:4, height:4, borderRadius:1, background: step === i ? activeColor : linkColor, opacity: step === i ? 1 : 0.4, transition:'all 0.25s cubic-bezier(0.4,0,0.2,1)', transform: step === i ? 'scale(1.4)' : 'scale(1)' }} />
        ))}
      </span>
    </button>
  );
};

/* ─── ScrollDownButton — mouse + chevrons indicator, centered bottom ─────── */
const ScrollDownButton = ({ targetId }) => (
  <button
    onClick={() => scrollTo(targetId)}
    aria-label="Scroll to next section"
    className="flex flex-col items-center gap-2 opacity-55 hover:opacity-100 transition-opacity duration-300 group"
  >
    {/* Mouse outline with scrolling dot */}
    <div
      className="w-7 h-12 rounded-full border-2 border-textMuted group-hover:border-primary transition-colors duration-300 flex justify-center pt-2 relative overflow-hidden"
    >
      <div className="w-[5px] h-[5px] rounded-full bg-textMuted group-hover:bg-primary transition-colors duration-300 scroll-dot-anim" />
    </div>

    {/* Triple chevrons with staggered fade */}
    <div className="flex flex-col items-center -space-y-2">
      {[1, 0.55, 0.2].map((op, i) => (
        <svg key={i} width="22" height="14" viewBox="0 0 24 14" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: op }}
          className="text-textMuted group-hover:text-primary transition-colors duration-300"
        >
          <path d="M3 2l9 9 9-9" />
        </svg>
      ))}
    </div>
  </button>
);

/* ─── AnimatedSection ────────────────────────────────────────────────────── */
const AnimatedSection = ({ children, className = '', style, id, scrollTarget }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) setVisible(true);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      id={id}
      ref={ref}
      className={className}
      style={{
        ...style,
        transition: 'opacity 0.5s cubic-bezier(0.4,0,0.2,1), transform 0.5s cubic-bezier(0.4,0,0.2,1)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
      }}
    >
      {children}
      {scrollTarget && (
        <div style={{
          position: 'absolute', bottom: 32, right: 40,
          transition: 'opacity 0.4s ease, transform 0.4s ease',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
          pointerEvents: visible ? 'auto' : 'none',
        }}>
          <ScrollDownButton targetId={scrollTarget} />
        </div>
      )}
    </section>
  );
};

/* ─── HeroCanvasPreview ──────────────────────────────────────────────────── */
const HeroCanvasPreview = ({ onlineUsers }) => (
  <div className="w-full">
    <div className="flex items-center gap-2 mb-2">
      <div className="w-2 h-2 rounded-full bg-success flex-shrink-0"
           style={{ animation: 'subtle-pulse 2s ease-in-out infinite' }} />
      <span className="text-xs text-textMuted uppercase tracking-wider font-medium">Live canvas preview</span>
      <span className="ml-auto text-xs font-mono text-textMuted">{onlineUsers ?? '—'} online</span>
    </div>
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)',
      gap: 2, padding: 6,
      background: 'rgb(var(--surface))',
      border: '1px solid rgb(var(--border))',
      borderRadius: 10,
      boxShadow: '0 6px 24px rgb(var(--shadow) / 0.15)',
    }}>
      {HERO_CANVAS.map((color, i) => (
        <div key={i} style={{
          width: '100%', aspectRatio: '1',
          background: color ?? 'rgb(var(--bg-alt))',
          borderRadius: 1,
        }} />
      ))}
    </div>
    <div className="flex items-center justify-between mt-2 px-1">
      <p className="text-xs text-textMuted">1,000,000 pixels total</p>
      <p className="text-xs text-textMuted font-mono">4,218 painted today</p>
    </div>
  </div>
);

/* ─── BiddingPreview ─────────────────────────────────────────────────────── */
const BiddingPreview = () => (
  <div className="card p-5 bg-backgroundAlt relative overflow-hidden">
    <div className="absolute top-0 left-0 right-0 h-0.5"
      style={{ background: 'linear-gradient(90deg,#E53E3E,#ED8936,#ECC94B,#48BB78,#4299E1,#9F7AEA)' }} />
    <div className="flex items-center gap-2 mb-4">
      <div className="w-2 h-2 rounded-full bg-error" style={{ animation: 'subtle-pulse 2s ease-in-out infinite' }} />
      <span className="text-xs font-semibold uppercase tracking-wider text-textMuted">Live auction — Epoch #1</span>
      <div className="ml-auto flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#ED8936' }}>
        ⏱ 23h 14m left
      </div>
    </div>
    <div className="grid md:grid-cols-2 gap-5 items-start">
      <div>
        <p className="text-[10px] text-textMuted uppercase tracking-wider font-medium mb-2">Canvas — locked 50×50 zone</p>
        <AuctionCanvasZone />
      </div>
      <div>
        <p className="text-[10px] text-textMuted uppercase tracking-wider font-medium mb-3">Current bids</p>
        <div className="space-y-2 mb-4">
          <AuctionBid rank={1} address="erd1…9f3a" amount="0.85 EGLD" leading />
          <AuctionBid rank={2} address="erd1…a3f2" amount="0.72 EGLD" />
          <AuctionBid rank={3} address="erd1…7c1e" amount="0.50 EGLD" />
          <AuctionBid rank={4} address="erd1…2b4d" amount="0.31 EGLD" />
        </div>
        <div className="p-3 rounded-lg border border-border bg-surface text-xs text-textSecondary mb-3">
          <span className="text-textPrimary font-semibold">Min. next bid: </span>
          0.935 EGLD <span className="text-textMuted">(+10% above leader)</span>
        </div>
        <button disabled className="w-full btn-primary text-sm py-2 opacity-50 cursor-not-allowed">
          Place bid ↗ (demo preview)
        </button>
      </div>
    </div>
  </div>
);

const AuctionCanvasZone = () => {
  const colors = ['#E53E3E','#ED8936','#ECC94B','#48BB78','#4299E1','#9F7AEA','#ED64A6','#E53E3E','#4299E1','#48BB78'];
  return (
    <div className="relative rounded-lg overflow-hidden border border-border shadow-soft"
         style={{ background: 'rgb(var(--bg-alt))', aspectRatio: '4/3' }}>
      <div className="absolute inset-0 opacity-[0.07]"
           style={{
             backgroundImage: 'repeating-linear-gradient(0deg,currentColor 0,currentColor 1px,transparent 1px,transparent 100%),repeating-linear-gradient(90deg,currentColor 0,currentColor 1px,transparent 1px,transparent 100%)',
             backgroundSize: '12px 12px',
           }} />
      <div className="absolute rounded-sm" style={{ top:'8%',  left:'4%',  width:'20%', height:'20%', background:'#E53E3E', opacity:0.55 }} />
      <div className="absolute rounded-sm" style={{ top:'35%', left:'5%',  width:'13%', height:'18%', background:'#4299E1', opacity:0.55 }} />
      <div className="absolute rounded-sm" style={{ top:'62%', left:'4%',  width:'16%', height:'22%', background:'#ECC94B', opacity:0.55 }} />
      <div className="absolute rounded-sm" style={{ top:'10%', right:'5%', width:'18%', height:'30%', background:'#9F7AEA', opacity:0.55 }} />
      <div className="absolute rounded-sm" style={{ top:'55%', right:'4%', width:'14%', height:'20%', background:'#48BB78', opacity:0.55 }} />
      {colors.map((c, i) => (
        <div key={i} aria-hidden="true" style={{
          position:'absolute', width:5, height:5, borderRadius:1, background:c, opacity:0.35,
          top:`${10+(i*8)%75}%`, left:`${25+(i*13)%50}%`,
        }} />
      ))}
      <div className="absolute flex flex-col items-center justify-center gap-1"
           style={{ top:'18%', left:'30%', width:'40%', height:'56%', border:'2px solid #E5B547', borderRadius:3, background:'rgba(229,181,71,0.07)' }}>
        <span style={{ fontSize:22 }}>🔒</span>
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color:'#E5B547' }}>Auction Zone</span>
        <span className="text-[8px] text-textMuted">50 × 50 px</span>
      </div>
      <div aria-hidden="true" className="absolute pointer-events-none"
           style={{ top:'16%', left:'28%', width:'44%', height:'60%', border:'1px solid rgba(229,181,71,0.25)', borderRadius:4, animation:'ping 2.5s cubic-bezier(0,0,0.2,1) infinite' }} />
    </div>
  );
};

const AuctionBid = ({ rank, address, amount, leading }) => (
  <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${leading ? 'border-primary/30' : 'border-border bg-surface'}`}
       style={leading ? { background: 'rgb(var(--primary) / 0.06)' } : {}}>
    <span className={`text-xs font-bold w-5 flex-shrink-0 ${leading ? 'text-primaryDark' : 'text-textMuted'}`}>#{rank}</span>
    <span className="text-xs font-mono text-textSecondary flex-1">{address}</span>
    <span className={`text-sm font-semibold tabular-nums ${leading ? 'text-primaryDark' : 'text-textPrimary'}`}>{amount}</span>
    {leading && (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-primaryDark"
            style={{ background: 'rgb(var(--primary) / 0.2)' }}>Leading</span>
    )}
  </div>
);

/* ─── Remaining sub-components ───────────────────────────────────────────── */

const Stat = ({ label, value, emphasis }) => (
  <div>
    <div className={`font-heading text-3xl sm:text-4xl font-semibold tracking-tight ${emphasis ? 'text-charityDark' : 'text-textPrimary'}`}>{value}</div>
    <div className="text-xs sm:text-sm text-textMuted mt-1">{label}</div>
  </div>
);

const Step = ({ n, color, title, body }) => (
  <div className="card p-5 hover:shadow-card transition-shadow duration-200 flex flex-col gap-3">
    <div className="w-10 h-10 rounded-lg font-heading font-bold text-lg flex items-center justify-center shadow-soft flex-shrink-0"
      style={{ background: color.bg, color: color.text }}>{n}</div>
    <h3 className="font-heading text-base font-semibold leading-snug">{title}</h3>
    <p className="text-sm text-textSecondary leading-relaxed">{body}</p>
  </div>
);

const EpochPhase = ({ icon, color, label, title, body }) => (
  <div className="flex flex-col items-center text-center gap-2">
    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-card z-10 bg-surface border border-border"
      style={{ boxShadow: `0 0 0 3px ${color}33` }}>{icon}</div>
    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: color + '22', color }}>{label}</div>
    <h3 className="font-heading text-base font-semibold">{title}</h3>
    <p className="text-sm text-textSecondary leading-relaxed">{body}</p>
  </div>
);

const EpochStat = ({ icon, label, value, sub, color }) => (
  <div className="card p-5 relative overflow-hidden">
    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: color }} />
    <div className="text-3xl mb-2">{icon}</div>
    <div className="text-xs text-textMuted uppercase tracking-wider font-medium mb-1">{label}</div>
    <div className="font-heading text-2xl font-semibold text-textPrimary mb-1">{value}</div>
    <p className="text-sm text-textMuted">{sub}</p>
  </div>
);

const CharityCard = ({ charity, isHighlighted, votePct }) => (
  <div className={`card p-4 relative overflow-hidden transition-shadow duration-200 hover:shadow-card ${isHighlighted ? 'ring-2' : ''}`}
       style={isHighlighted ? { '--tw-ring-color': charity.color } : {}}>
    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: charity.color }} />
    {isHighlighted && (
      <div className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
        style={{ background: charity.color }}>Leading</div>
    )}
    <div className="flex items-start gap-2 mt-1">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 border border-border bg-backgroundAlt">
        {charity.icon}
      </div>
      <div>
        <h3 className="font-heading text-base font-semibold leading-snug">{charity.name}</h3>
        <p className="text-sm text-textSecondary leading-relaxed mt-0.5">{charity.mission}</p>
      </div>
    </div>
    <div className="mt-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] text-textMuted">Credits allocated</span>
        <span className="text-[10px] font-semibold" style={{ color: charity.color }}>{votePct}%</span>
      </div>
      <div className="h-1.5 bg-backgroundAlt rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ background: charity.color, width: `${votePct}%` }} />
      </div>
    </div>
  </div>
);

const NftFeature = ({ color, text }) => (
  <li className="flex items-start gap-3">
    <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: color + '22', color }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    </span>
    <span className="leading-relaxed">{text}</span>
  </li>
);

const NFT_PIXELS = [
  '#9F7AEA','#9F7AEA','#4299E1','#4299E1','#48BB78','#48BB78','#ECC94B','#ECC94B','#E53E3E','#E53E3E',
  '#9F7AEA','#fff',   '#fff',   '#4299E1','#48BB78','#fff',   '#fff',   '#ECC94B','#E53E3E','#E53E3E',
  '#4299E1','#fff',   '#fff',   '#fff',   '#fff',   '#48BB78','#fff',   '#fff',   '#fff',   '#ED8936',
  '#4299E1','#4299E1','#fff',   '#9F7AEA','#9F7AEA','#48BB78','#ECC94B','#fff',   '#ED8936','#ED8936',
  '#48BB78','#48BB78','#9F7AEA','#9F7AEA','#9F7AEA','#ECC94B','#ECC94B','#ED8936','#ED8936','#E53E3E',
  '#48BB78','#fff',   '#fff',   '#9F7AEA','#ECC94B','#ECC94B','#fff',   '#fff',   '#E53E3E','#E53E3E',
  '#ECC94B','#fff',   '#fff',   '#fff',   '#fff',   '#E53E3E','#fff',   '#fff',   '#fff',   '#9F7AEA',
  '#ECC94B','#ECC94B','#48BB78','#48BB78','#E53E3E','#E53E3E','#4299E1','#4299E1','#9F7AEA','#9F7AEA',
  '#E53E3E','#ECC94B','#48BB78','#E53E3E','#E53E3E','#4299E1','#4299E1','#9F7AEA','#9F7AEA','#ED8936',
  '#E53E3E','#E53E3E','#E53E3E','#E53E3E','#4299E1','#4299E1','#9F7AEA','#9F7AEA','#ED8936','#ED8936',
];

const NftMockup = () => (
  <div className="relative">
    <div className="card p-3 shadow-elevate"
      style={{ background: 'linear-gradient(135deg, rgb(var(--surface)) 0%, rgb(var(--bg-alt)) 100%)' }}>
      <div className="h-1 rounded-full mb-3"
        style={{ background: 'linear-gradient(90deg,#E53E3E,#ED8936,#ECC94B,#48BB78,#4299E1,#9F7AEA)' }} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(10,1fr)', gap:3, width:200 }}>
        {NFT_PIXELS.map((c,i) => (
          <div key={i} style={{ width:'100%', aspectRatio:'1', background:c, borderRadius:2 }} />
        ))}
      </div>
      <div className="mt-3 pt-2 border-t border-border">
        <p className="text-[10px] font-mono text-textMuted">Epoch #1 · Top Painter NFT</p>
        <p className="text-[10px] font-mono text-textMuted">Save the Children · MultiversX</p>
      </div>
    </div>
    <div className="absolute inset-0 rounded-xl pointer-events-none"
      style={{ boxShadow:'0 0 40px rgb(159 122 234 / 0.2)' }} />
  </div>
);

const SplitItem = ({ color, title, body }) => (
  <div className="flex items-start gap-2.5">
    <div className={`w-3 h-3 rounded-sm flex-shrink-0 mt-1 ${color}`} />
    <div>
      <span className="font-semibold text-textPrimary text-base">{title} </span>
      <span className="text-base text-textSecondary">{body}</span>
    </div>
  </div>
);

const TierRow = ({ name, egld, pixels, bonus, featured, dot }) => (
  <div className={`card px-4 py-3.5 flex items-center gap-3 hover:shadow-card transition-shadow duration-200 ${featured ? 'ring-1 ring-primary' : ''}`}>
    <div style={{ width:9, height:9, borderRadius:2, background:dot, flexShrink:0 }} />
    <div className="font-heading text-base font-semibold flex-1">{name}</div>
    <div className="text-base font-semibold text-primaryDark">{egld} <span className="text-xs text-textMuted font-normal">EGLD</span></div>
    <div className="text-sm text-textSecondary w-20 text-right">{pixels} px</div>
    {bonus ? <div className="text-sm text-charityDark font-medium w-12 text-right">{bonus}</div> : <div className="w-12" />}
    {featured && <div className="text-xs text-primary font-semibold">★ Best</div>}
  </div>
);

export default WelcomePage;
