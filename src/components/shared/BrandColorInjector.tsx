import { useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Fleet Flow is JeanWay's own system and its palette lives in the design
 * tokens (src/index.css). The org's stored brand color is no longer injected
 * over them; this clears any override a previous session left on <html>.
 */
export function BrandColorInjector() {
  const { applyBrandColor, theme } = useTheme();

  useEffect(() => {
    applyBrandColor(null);
  }, [applyBrandColor, theme]);

  return null;
}
