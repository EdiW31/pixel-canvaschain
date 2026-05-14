/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // All colours are CSS variables defined in `src/index.css` —
        // values are space-separated RGB triplets (e.g. "251 250 246")
        // so Tailwind can apply alpha modifiers like `bg-primary/40`.
        background:    'rgb(var(--bg) / <alpha-value>)',
        backgroundAlt: 'rgb(var(--bg-alt) / <alpha-value>)',
        surface:       'rgb(var(--surface) / <alpha-value>)',
        border:        'rgb(var(--border) / <alpha-value>)',
        borderStrong:  'rgb(var(--border-strong) / <alpha-value>)',

        primary:       'rgb(var(--primary) / <alpha-value>)',
        primaryDark:   'rgb(var(--primary-dark) / <alpha-value>)',
        primaryLight:  'rgb(var(--primary-light) / <alpha-value>)',

        charity:       'rgb(var(--charity) / <alpha-value>)',
        charityDark:   'rgb(var(--charity-dark) / <alpha-value>)',
        charityLight:  'rgb(var(--charity-light) / <alpha-value>)',

        success:       'rgb(var(--success) / <alpha-value>)',
        error:         'rgb(var(--error) / <alpha-value>)',

        textPrimary:   'rgb(var(--text) / <alpha-value>)',
        textSecondary: 'rgb(var(--text-secondary) / <alpha-value>)',
        textMuted:     'rgb(var(--text-muted) / <alpha-value>)',

        // Back-compat aliases
        secondary:     'rgb(var(--charity) / <alpha-value>)',
        accent:        'rgb(var(--primary) / <alpha-value>)',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Fraunces', 'Inter', 'serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft:    '0 1px 2px rgb(var(--shadow) / 0.06), 0 1px 4px rgb(var(--shadow) / 0.06)',
        card:    '0 2px 8px rgb(var(--shadow) / 0.08), 0 1px 2px rgb(var(--shadow) / 0.06)',
        elevate: '0 8px 24px rgb(var(--shadow) / 0.12), 0 2px 6px rgb(var(--shadow) / 0.06)',
        focus:   '0 0 0 4px rgb(var(--primary) / 0.22)',
      },
      animation: {
        'fade-in':     'fadeIn 0.4s ease-out',
        'slide-up':    'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'subtle-pulse':'subtlePulse 3s ease-in-out infinite',
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
