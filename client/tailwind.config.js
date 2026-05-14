/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm, light palette — Claude-inspired with yellow accents.
        // Slightly whiter than Claude's cream so the brands don't collide.
        background:    '#FBFAF6',  // page background (warm off-white)
        backgroundAlt: '#F4F1E8',  // section dividers, soft sand
        surface:       '#FFFFFF',  // card surfaces, pure white
        border:        '#EBE7DD',  // subtle warm border
        borderStrong:  '#D9D4C5',  // stronger divider

        // Primary: warm gold-yellow (replaces Claude's coral/orange)
        primary:       '#E5B547',
        primaryDark:   '#C49628',
        primaryLight:  '#FCF4D9',  // pale tint for soft backgrounds

        // Charity: sage green that emphasizes the mission
        charity:       '#7B9E5D',
        charityDark:   '#5E7C46',
        charityLight:  '#E8F0DE',

        // Semantic colors (muted, in the same warm family)
        success:       '#5B8A5B',
        error:         '#C2563F',

        // Text
        textPrimary:   '#1B1A17',  // warm near-black
        textSecondary: '#5A574F',  // body
        textMuted:     '#9B978F',  // muted captions

        // Back-compat aliases so existing components don't crash.
        // These can be removed once every component is migrated.
        secondary:     '#7B9E5D',  // (was magenta) → reuse charity green
        accent:        '#E5B547',  // (was neon yellow) → primary gold
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Fraunces', 'Inter', 'serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft:    '0 1px 2px rgba(27, 26, 23, 0.04), 0 1px 4px rgba(27, 26, 23, 0.04)',
        card:    '0 2px 8px rgba(27, 26, 23, 0.06), 0 1px 2px rgba(27, 26, 23, 0.04)',
        elevate: '0 8px 24px rgba(27, 26, 23, 0.08), 0 2px 6px rgba(27, 26, 23, 0.04)',
        focus:   '0 0 0 4px rgba(229, 181, 71, 0.18)',
      },
      animation: {
        'fade-in':  'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'subtle-pulse': 'subtlePulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: {
          '0%':   { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        subtlePulse: {
          '0%, 100%': { opacity: 1 },
          '50%':      { opacity: 0.7 },
        },
      },
    },
  },
  plugins: [],
}
