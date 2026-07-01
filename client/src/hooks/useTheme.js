import { useEffect, useState } from 'react';

// useTheme — global light/dark mode. Applied in three layers (data-theme attr,
// Tailwind `dark` class, inline style fallback) so dark mode paints reliably.
// index.html also applies the initial theme inline to avoid a light flash.

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

  // Layer 1 — attribute (CSS vars switch).
  root.setAttribute('data-theme', theme);

  // Layer 2 — class (Tailwind dark: variants).
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');

  // Layer 3 — inline style fallback.
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
