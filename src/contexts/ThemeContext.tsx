import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  applyBrandColor: (hsl: string | null) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const BRAND_VARS = ['--primary', '--accent', '--ring', '--sidebar-primary', '--sidebar-ring'];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('jeanway-theme') as Theme;
      if (stored) return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('jeanway-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const applyBrandColor = useCallback((hsl: string | null) => {
    const root = document.documentElement;

    if (!hsl) {
      // Reset to defaults — remove inline overrides
      BRAND_VARS.forEach(v => root.style.removeProperty(v));
      return;
    }

    // Normalize: ensure "45 80% 45%" format (with %)
    const parts = hsl.trim().split(/\s+/);
    if (parts.length !== 3) return;

    const h = parts[0];
    const s = parts[1].endsWith('%') ? parts[1] : `${parts[1]}%`;
    const lRaw = parseInt(parts[2]);
    const lLight = `${lRaw}%`;

    // For dark mode bump lightness by 5 (capped at 60%)
    const lDark = `${Math.min(lRaw + 5, 60)}%`;

    const isDark = document.documentElement.classList.contains('dark');
    const value = `${h} ${s} ${isDark ? lDark : lLight}`;

    BRAND_VARS.forEach(v => root.style.setProperty(v, value));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, applyBrandColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
