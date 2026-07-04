import type { GustoSDKTheme } from '@gusto/embedded-react-sdk';

/**
 * Gusto Embedded theme mapped to FleetFlow's HSL design tokens so the
 * white-labeled Gusto flows visually match the rest of the TMS shell.
 *
 * The Gusto SDK expects flat CSS color strings, so we wrap our
 * `hsl(var(--token))` variables — that way any global theme swap
 * (light/dark, brand color changes) automatically propagates into the
 * embedded frame.
 */
const hslVar = (token: string) => `hsl(var(${token}))`;

export const gustoFleetFlowTheme: Partial<GustoSDKTheme> = {
  colorBody: hslVar('--background'),
  colorBodyAccent: hslVar('--muted'),
  colorBodyContent: hslVar('--foreground'),
  colorBodySubContent: hslVar('--muted-foreground'),
  colorPrimary: hslVar('--primary'),
  colorPrimaryAccent: hslVar('--primary'),
  colorPrimaryContent: hslVar('--primary-foreground'),
  colorSecondary: hslVar('--secondary'),
  colorSecondaryAccent: hslVar('--secondary'),
  colorSecondaryContent: hslVar('--secondary-foreground'),
  colorBorderPrimary: hslVar('--border'),
  colorBorderSecondary: hslVar('--border'),
};
