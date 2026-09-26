"use client";
import { useTheme } from '@/lib/ThemeProvider';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-toggle" title="Toggle theme">
      <button
        className={theme === 'light' ? 'active' : ''}
        onClick={() => setTheme('light')}
        title="Light"
        aria-label="Light theme"
      >☀️</button>
      <button
        className={theme === 'system' ? 'active' : ''}
        onClick={() => setTheme('system')}
        title="System"
        aria-label="Use system theme"
      >💻</button>
      <button
        className={theme === 'dark' ? 'active' : ''}
        onClick={() => setTheme('dark')}
        title="Dark"
        aria-label="Dark theme"
      >🌙</button>
    </div>
  );
}
