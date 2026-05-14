import { useEffect, useState } from 'react';

/**
 * useTheme — global light/dark mode hook.
 *
 * Applies BOTH `data-theme="dark|light"` AND a `dark` class on <html>.
 *   - data-theme drives the CSS custom-property switch in index.css
 *   - the `dark` class activates Tailwind's `dark:` variants
 *
 * Initial theme is applied via an inline script in index.html (FOUC-safe).
 * This hook keeps React state in sync with that initial value and writes back
 * to localStorage on changes.
 */

const STORAGE_KEY = 'canvaschain-theme';

const readSavedTheme = () => {
  if (typeof window === 'undefined') return 'light';
  // Trust whatever the inline script in index.html already applied.
  const fromDom = document.documentElement.getAttribute('data-theme');
  if (fromDom === 'light' || fromDom === 'dark') return fromDom;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
};

export const useTheme = () => {
  const [theme, setTheme] = useState(readSavedTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) { /* ignore */ }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, setTheme, toggle, isDark: theme === 'dark' };
};
