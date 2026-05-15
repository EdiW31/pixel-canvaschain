import { useTheme } from '../hooks/useTheme';

/**
 * ThemeToggle — animated pill switch with sliding sun/moon thumb.
 */
const ThemeToggle = ({ className = '' }) => {
  const { isDark, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`relative flex items-center flex-shrink-0 ${className}`}
      style={{
        width: 52,
        height: 28,
        borderRadius: 999,
        background: isDark
          ? 'rgb(var(--primary) / 0.18)'
          : 'rgb(var(--border-strong))',
        border: `1.5px solid ${isDark ? 'rgb(var(--primary) / 0.4)' : 'rgb(var(--border-strong))'}`,
        transition: 'background 0.3s ease, border-color 0.3s ease',
        padding: 3,
      }}
    >
      {/* Track icons */}
      <span style={{
        position: 'absolute', left: 7, opacity: isDark ? 0 : 0.5,
        transition: 'opacity 0.25s ease', lineHeight: 1, fontSize: 11,
      }}>☀️</span>
      <span style={{
        position: 'absolute', right: 7, opacity: isDark ? 0.8 : 0,
        transition: 'opacity 0.25s ease', lineHeight: 1, fontSize: 11,
      }}>🌙</span>

      {/* Sliding thumb */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: isDark ? 'rgb(var(--primary))' : 'rgb(var(--surface))',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          transform: isDark ? 'translateX(24px)' : 'translateX(0)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1), background 0.3s ease',
          flexShrink: 0,
        }}
      >
        {isDark
          ? <SunIcon size={11} color="#1B1A17" />
          : <MoonIcon size={11} color="rgb(var(--text-secondary))" />
        }
      </span>
    </button>
  );
};

const SunIcon = ({ size = 12, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const MoonIcon = ({ size = 12, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export default ThemeToggle;
