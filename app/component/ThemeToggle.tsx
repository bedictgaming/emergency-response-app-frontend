'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'emergency-response-theme';

function applyTheme(theme: Theme) {
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#db0000');
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  const pathname = usePathname();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const current: Theme = isAdmin ? 'light' : saved === 'light' || saved === 'dark'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(current);
    setTheme(current);

    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || (event.newValue !== 'light' && event.newValue !== 'dark')) return;
      const next = isAdmin ? 'light' : event.newValue;
      applyTheme(next);
      setTheme(next);
    };
    window.addEventListener('storage', syncAcrossTabs);
    return () => window.removeEventListener('storage', syncAcrossTabs);
  }, [isAdmin]);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    setTheme(next);
  };

  const dark = theme === 'dark';
  if (isAdmin) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      className="theme-toggle fixed z-[70] flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
    >
      {dark ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
