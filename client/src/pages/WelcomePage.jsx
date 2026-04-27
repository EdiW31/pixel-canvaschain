import { Link } from 'react-router-dom';

/**
 * WelcomePage - Landing page with hero section
 *
 * Features:
 * - Animated hero title with neon glow
 * - Subtitle with project description
 * - Feature highlights (3 cards)
 * - Large "Enter" CTA button
 * - Gradient background
 */

const WelcomePage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-surface flex items-center justify-center p-6">
      <div className="max-w-6xl w-full">
        {/* Hero Section */}
        <div className="text-center mb-12">
          {/* Logo/Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-primary via-secondary to-accent rounded-2xl flex items-center justify-center animate-pulse-glow shadow-neon-cyan">
              <span className="text-6xl">🎨</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-6xl md:text-7xl font-heading font-bold mb-4 tracking-wider">
            <span className="text-primary" style={{ textShadow: '0 0 20px #00ffff' }}>
              PIXEL
            </span>{' '}
            <span className="text-secondary" style={{ textShadow: '0 0 20px #ff00ff' }}>
              CANVASCHAIN
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl text-textSecondary mb-8 max-w-2xl mx-auto">
            A massively multiplayer collaborative canvas on{' '}
            <span className="text-accent font-bold">MultiversX</span>
            <br />
            Merging digital art with blockchain and{' '}
            <span className="text-success font-bold">50% philanthropic</span> giving
          </p>

          {/* Enter Button */}
          <Link
            to="/login"
            className="inline-block px-12 py-4 bg-primary border-2 border-primary text-background rounded-lg text-xl font-bold hover:bg-transparent hover:text-primary transition-all duration-300 shadow-neon-cyan hover:shadow-neon-magenta animate-pulse-glow"
          >
            Enter the Canvas
          </Link>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 mt-16">
          {/* Feature 1 */}
          <div className="bg-surface border border-primary/30 rounded-lg p-6 hover:border-primary hover:shadow-neon-cyan transition-all duration-300">
            <div className="text-4xl mb-4">🖼️</div>
            <h3 className="text-lg font-heading font-bold text-primary mb-2">
              1000x1000 Canvas
            </h3>
            <p className="text-sm text-textSecondary">
              Paint on a massive collaborative canvas. Every pixel is yours to claim.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-surface border border-secondary/30 rounded-lg p-6 hover:border-secondary hover:shadow-neon-magenta transition-all duration-300">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-lg font-heading font-bold text-secondary mb-2">
              Real-time Painting
            </h3>
            <p className="text-sm text-textSecondary">
              See every pixel update instantly. Collaborate with artists worldwide.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-surface border border-success/30 rounded-lg p-6 hover:border-success hover:shadow-neon-green transition-all duration-300">
            <div className="text-4xl mb-4">❤️</div>
            <h3 className="text-lg font-heading font-bold text-success mb-2">
              50% to Charity
            </h3>
            <p className="text-sm text-textSecondary">
              Every purchase automatically sends 50% to child welfare organizations.
            </p>
          </div>
        </div>

        {/* Footer Info */}
        <div className="text-center mt-12">
          <p className="text-xs text-textSecondary">
            Powered by{' '}
            <span className="text-accent font-bold">MultiversX Blockchain</span>
            {' • '}
            Phase 1: Prototype (Mock Wallet)
          </p>
        </div>
      </div>
    </div>
  );
};

export default WelcomePage;
