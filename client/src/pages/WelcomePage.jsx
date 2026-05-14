import { Link } from 'react-router-dom';

/**
 * WelcomePage — Landing page
 *
 * Sections:
 *   1. Hero — mission statement + primary CTA
 *   2. Why we built this — the philanthropic motivation
 *   3. How it works — 4-step explanation of the on-chain mechanic
 *   4. Where the money goes — visual 25/25/50 split
 *   5. Tier preview — pricing peek
 *   6. CTA footer
 */

const WelcomePage = () => {
  return (
    <div className="min-h-screen bg-background text-textPrimary">
      {/* ─── Top navigation ───────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-lg">
              🎨
            </div>
            <div className="leading-tight">
              <div className="font-heading text-lg font-semibold tracking-tight">
                Pixel CanvasChain
              </div>
              <div className="text-xs text-textMuted">Painting for a cause</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <a href="#mission"     className="btn-ghost hidden sm:inline-flex">Mission</a>
            <a href="#how-it-works" className="btn-ghost hidden sm:inline-flex">How it works</a>
            <Link to="/login" className="btn-primary">Open the app</Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-16 sm:pt-24 pb-16 text-center animate-slide-up">
        <span className="pill-charity mb-6">
          <span>♥</span>
          50% of every purchase goes directly to charity — enforced on-chain
        </span>

        <h1 className="font-heading text-5xl sm:text-7xl font-semibold tracking-tighter leading-[1.05] mb-6">
          A million pixels.<br />
          <span className="italic text-primaryDark">One shared canvas.</span><br />
          For children who need it most.
        </h1>

        <p className="text-lg sm:text-xl text-textSecondary max-w-2xl mx-auto leading-relaxed mb-10">
          Pixel CanvasChain is a collaborative pixel-art platform on the MultiversX blockchain.
          Buy painting credits, place pixels on a public canvas, and watch <strong className="text-textPrimary font-semibold">half of every cent</strong> flow
          automatically to child-welfare organizations — no middleman, no broken promises.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/login" className="btn-primary-lg">
            Start painting →
          </Link>
          <a href="#how-it-works" className="btn-secondary">
            How it works
          </a>
        </div>

        {/* Stats strip */}
        <div className="mt-16 grid grid-cols-3 gap-4 sm:gap-8 max-w-2xl mx-auto">
          <Stat label="Pixels available" value="1M" />
          <Stat label="To charity" value="50%" emphasis />
          <Stat label="On-chain" value="100%" />
        </div>
      </section>

      {/* ─── Mission ────────────────────────────────────────────────────── */}
      <section id="mission" className="bg-backgroundAlt border-y border-border">
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-24">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <div className="pill mb-4">Why we built this</div>
              <h2 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight mb-6">
                Charity should be a guarantee, not a marketing slogan.
              </h2>
            </div>

            <div className="space-y-5 text-textSecondary text-base leading-relaxed">
              <p>
                Every year, billions of dollars are pledged to charity by tech platforms — and
                a depressing share never arrives. The donor trusts a company; the company
                writes a press release; the children get whatever's left after overhead, board
                travel, and "operational expenses".
              </p>
              <p className="text-textPrimary font-medium">
                We thought a smart contract could fix that.
              </p>
              <p>
                On Pixel CanvasChain, when you buy painting credits the EGLD is split <em>inside the
                same transaction</em>: 50% goes directly to a registered child-welfare wallet, 25%
                is burned (reducing token supply), 25% sustains the platform. The split is
                public, immutable, and verifiable by anyone with an internet connection.
              </p>
              <p>
                There is no "trust us". There is only the chain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── How it works ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-20 sm:py-24">
        <div className="text-center mb-14">
          <div className="pill mb-4">How it works</div>
          <h2 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight">
            Four steps from your wallet to a child's bank account
          </h2>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <Step n="1" title="Connect your wallet" body="Bring any MultiversX wallet — DeFi extension, xPortal, Ledger, or Web Wallet. No sign-up forms." />
          <Step n="2" title="Buy painting credits" body="Pick a tier. Pay in EGLD. Get pixels — plus bonus pixels at higher tiers." />
          <Step n="3" title="Charity gets paid" body="Half of your payment lands in the charity wallet inside the same block. No delay, no escrow." />
          <Step n="4" title="Paint a pixel" body="Spend a credit, place a pixel. Everyone sees it in real time. Your art is forever on the canvas." />
        </div>
      </section>

      {/* ─── Where the money goes (visual split) ───────────────────────── */}
      <section className="bg-backgroundAlt border-y border-border">
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-24">
          <div className="text-center mb-12">
            <div className="pill-charity mb-4">The split</div>
            <h2 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight">
              Where every coin actually goes
            </h2>
            <p className="text-textSecondary mt-4 max-w-xl mx-auto">
              The smart contract enforces this allocation on every single purchase. No one — not even us — can change it without redeploying and re-announcing.
            </p>
          </div>

          {/* Visual bar */}
          <div className="card p-6 sm:p-8">
            <div className="flex w-full h-12 rounded-lg overflow-hidden shadow-soft mb-6">
              <div className="bg-charity flex items-center justify-center text-white font-semibold text-sm" style={{ width: '50%' }}>
                50% → Charity
              </div>
              <div className="bg-primary flex items-center justify-center text-textPrimary font-semibold text-sm" style={{ width: '25%' }}>
                25% → Owner
              </div>
              <div className="bg-textMuted flex items-center justify-center text-white font-semibold text-sm" style={{ width: '25%' }}>
                25% → Burn
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-6 mt-8">
              <SplitItem
                color="bg-charity"
                title="Charity (50%)"
                body="Routed straight to a registered child-welfare organization (Save the Children at launch). Owner-only setter — public on the explorer."
              />
              <SplitItem
                color="bg-primary"
                title="Platform (25%)"
                body="Covers servers, the front-end, and ongoing development. Goes to the contract owner wallet."
              />
              <SplitItem
                color="bg-textMuted"
                title="Burn (25%)"
                body="Sent to an unspendable burn address — permanently reducing circulating supply and rewarding long-term holders."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Tier preview ───────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-20 sm:py-24">
        <div className="text-center mb-12">
          <div className="pill mb-4">Pricing</div>
          <h2 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight">
            Five tiers. The bigger you go, the more bonus pixels.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <TierPeek name="Novice"     egld="0.05" pixels="1,000"  bonus={null} />
          <TierPeek name="Apprentice" egld="0.25" pixels="5,500"  bonus="+10%" />
          <TierPeek name="Artisan"    egld="0.50" pixels="12,000" bonus="+20%" />
          <TierPeek name="Master"     egld="1.25" pixels="32,500" bonus="+30%" />
          <TierPeek name="Legend"     egld="2.50" pixels="75,000" bonus="+50%" featured />
        </div>

        <p className="text-center text-sm text-textMuted mt-8">
          Prices are devnet (test) values. Live mainnet pricing will scale proportionally.
        </p>
      </section>

      {/* ─── Bottom CTA ─────────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="max-w-3xl mx-auto px-6 py-20 sm:py-24 text-center">
          <h2 className="font-heading text-3xl sm:text-5xl font-semibold tracking-tight mb-6">
            Ready to paint something that matters?
          </h2>
          <p className="text-lg text-textSecondary mb-8">
            Every pixel you place helps a child. Every coin you spend can be traced.
            <br className="hidden sm:block" />
            That's the entire point.
          </p>
          <Link to="/login" className="btn-primary-lg">
            Open the canvas →
          </Link>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-backgroundAlt">
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-textMuted">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-xs">🎨</div>
            <span>Pixel CanvasChain</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://devnet-explorer.multiversx.com" target="_blank" rel="noopener noreferrer" className="hover:text-textPrimary transition-colors">
              MultiversX Explorer ↗
            </a>
            <span>Built on MultiversX</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

/* ─── Sub-components ────────────────────────────────────────────────────── */

const Stat = ({ label, value, emphasis }) => (
  <div>
    <div className={`font-heading text-3xl sm:text-4xl font-semibold tracking-tight ${emphasis ? 'text-charityDark' : 'text-textPrimary'}`}>
      {value}
    </div>
    <div className="text-xs sm:text-sm text-textMuted mt-1">{label}</div>
  </div>
);

const Step = ({ n, title, body }) => (
  <div className="card p-6 hover:shadow-card transition-shadow duration-200">
    <div className="w-8 h-8 rounded-full bg-primaryLight text-primaryDark font-heading font-semibold flex items-center justify-center mb-4">
      {n}
    </div>
    <h3 className="font-heading text-lg font-semibold mb-2">{title}</h3>
    <p className="text-sm text-textSecondary leading-relaxed">{body}</p>
  </div>
);

const SplitItem = ({ color, title, body }) => (
  <div>
    <div className="flex items-center gap-2 mb-2">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <h3 className="font-semibold text-textPrimary">{title}</h3>
    </div>
    <p className="text-sm text-textSecondary leading-relaxed">{body}</p>
  </div>
);

const TierPeek = ({ name, egld, pixels, bonus, featured }) => (
  <div className={`card p-5 text-center ${featured ? 'ring-2 ring-primary shadow-card' : ''}`}>
    {featured && <div className="pill mb-3">Best value</div>}
    <div className="font-heading text-lg font-semibold mb-1">{name}</div>
    <div className="text-2xl font-semibold text-primaryDark">{egld}<span className="text-sm text-textMuted ml-1">EGLD</span></div>
    <div className="text-sm text-textSecondary mt-2">{pixels} pixels</div>
    {bonus && <div className="text-xs text-charityDark mt-1 font-medium">{bonus} bonus</div>}
  </div>
);

export default WelcomePage;
