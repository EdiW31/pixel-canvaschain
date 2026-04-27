/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom dark mode color palette
        background: '#0a0a0f',
        surface: '#1a1a2e',
        primary: '#00ffff',      // Cyan neon
        secondary: '#ff00ff',    // Magenta neon
        accent: '#ffff00',       // Yellow neon
        success: '#00ff00',      // Green neon
        error: '#ff0066',        // Red-pink neon
        textPrimary: '#ffffff',
        textSecondary: '#b0b0c0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Orbitron', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        'neon-cyan': '0 0 10px #00ffff, 0 0 20px #00ffff',
        'neon-magenta': '0 0 10px #ff00ff, 0 0 20px #ff00ff',
        'neon-yellow': '0 0 10px #ffff00, 0 0 20px #ffff00',
        'neon-green': '0 0 10px #00ff00, 0 0 20px #00ff00',
      },
      animation: {
        'pulse-glow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
