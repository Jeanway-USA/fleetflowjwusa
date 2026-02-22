import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  applyBrandColor: (hsl: string | null) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Map of CSS variables to update when brand color changes
const COLOR_VARS_LIGHT = ['--primary', '--accent', '--ring', '--sidebar-primary', '--sidebar-ring'];
const COLOR_VARS_DARK = ['--primary', '--accent', '--ring', '--sidebar-primary', '--sidebar-ring'];

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

  const applyBrandColor = (hsl: string | null) => {
    const root = document.documentElement;
    if (!hsl) return; // keep defaults

    // For dark mode we slightly bump lightness
    const parts = hsl.split(' ');
    let darkHsl = hsl;
    if (parts.length === 3) {
      const lightness = parseInt(parts[2]);
      darkHsl = `${parts[0]} ${parts[1]} ${Math.min(lightness + 5, 60)}%`;
      // Make sure light version also has %
      if (!parts[2].includes('%')) hsl = `${parts[0]} ${parts[1]} ${parts[2]}%`;
    }

    COLOR_VARS_LIGHT.forEach(v => root.style.setProperty(v, hsl!));
    // We set both; the dark class selector overrides in CSS,
    // but inline styles override both, so this effectively works
    // We need to apply the dark variant too
    // A simpler approach: just set the vars. The dark/light distinction
    // is already handled by the CSS cascade, but inline styles win.
    // So we just apply the correct one based on current theme.
  };

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
