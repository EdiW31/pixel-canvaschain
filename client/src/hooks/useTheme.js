import { useEffect, useState } from 'react';

/**
 * useTheme — global light/dark mode hook.
 *
 * THREE layers of theme application to make sure dark mode actually paints:
 *   1. data-theme="dark|light" on <html>  → drives CSS custom-property switch
 *   2. class="dark" on <html>             → activates Tailwind `dark:` variants
 *   3. inline style on <body> + <html>    → bypasses Tailwind entirely as a
 *                                            last-resort fallback in case any
 *                                            cached CSS overrides the above
 *
 * Initial theme is also applied by an inline script in index.html so the page
 * doesn't flash light before this hook runs.
 */

const STORAGE_KEY = 'canvaschain-theme';

// Resolved colour values — kept in sync with the CSS variables in index.css.
const COLORS = {
  light: { bg: '#FBFAF6', text: '#1B1A17' },
  dark:  { bg: '#1A1817', text: '#F2EFE8' },
};

const readSavedTheme = () => {
  if (typeof window === 'undefined') return 'light';
  const fromDom = document.documentElement.getAttribute('data-theme');
  if (fromDom === 'light' || fromDom === 'dark') return fromDom;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;
  const colors = COLORS[theme] ?? COLORS.light;

  // Layer 1 — attribute (CSS vars switch)
  root.setAttribute('data-theme', theme);

  // Layer 2 — class (Tailwind dark: variants)
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');

  // Layer 3 — direct inline style fallback (bypasses CSS layers entirely)
  root.style.backgroundColor = colors.bg;
  root.style.color = colors.text;
  if (body) {
    body.style.backgroundColor = colors.bg;
    body.style.color = colors.text;
  }
};

export const useTheme = () => {
  const [theme, setTheme] = useState(readSavedTheme);

  useEffect(() => {
    applyTheme(theme);
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, setTheme, toggle, isDark: theme === 'dark' };
};
