import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Bridges AuthContext (org branding data) → ThemeContext (CSS injection).
 * Must be rendered inside both AuthProvider and ThemeProvider.
 */
export function BrandColorInjector() {
  const { primaryColor } = useAuth();
  const { applyBrandColor, theme } = useTheme();

  useEffect(() => {
    applyBrandColor(primaryColor || null);
  }, [primaryColor, applyBrandColor, theme]);

  return null;
}
