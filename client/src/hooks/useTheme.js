import { useEffect, useState } from 'react';

/**
 * useTheme — global light/dark mode hook.
 *
 * Applies `data-theme="dark" | "light"` on <html>, which the CSS variables in
 * index.css listen to. Persists choice in localStorage; falls back to the OS
 * preference on first visit.
 */

const STORAGE_KEY = 'canvaschain-theme';

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
};

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
};

// Apply the initial theme as early as possible to avoid a flash of light
// content on dark-preference visitors.
if (typeof window !== 'undefined') {
  applyTheme(getInitialTheme());
}

export const useTheme = () => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {
      // ignore (private mode, quota, etc.)
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, setTheme, toggle, isDark: theme === 'dark' };
};
