import type { GustoSDKTheme } from '@gusto/embedded-react-sdk';

/**
 * Gusto Embedded theme mapped to FleetFlow's HSL design tokens so the
 * white-labeled Gusto flows visually match the rest of the TMS shell.
 *
 * The Gusto SDK expects concrete CSS color strings, so we wrap our
 * `hsl(var(--token))` variables — that way any global theme swap
 * (light/dark, brand color changes) automatically propagates into the
 * embedded frame.
 */
const hslVar = (token: string) => `hsl(var(${token}))`;

export const gustoFleetFlowTheme: Partial<GustoSDKTheme> = {
  colors: {
    background: {
      primary: hslVar('--background'),
      secondary: hslVar('--card'),
      tertiary: hslVar('--muted'),
    } as never,
    text: {
      primary: hslVar('--foreground'),
      secondary: hslVar('--muted-foreground'),
    } as never,
    action: {
      primary: hslVar('--primary'),
      primaryHover: hslVar('--primary'),
    } as never,
    border: {
      primary: hslVar('--border'),
    } as never,
  } as never,
};
