import { useTheme } from '../hooks/useTheme';

/**
 * ThemeToggle — small sun/moon button.
 * Drop it into any nav/header. Persists state via useTheme().
 */
const ThemeToggle = ({ className = '' }) => {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`w-9 h-9 rounded-lg border border-border hover:border-borderStrong
                  bg-surface text-textSecondary hover:text-textPrimary
                  flex items-center justify-center transition-colors ${className}`}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
};

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export default ThemeToggle;
