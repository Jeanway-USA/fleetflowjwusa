import { formatDistanceToNowStrict } from 'date-fns';

export type EldTone = 'live' | 'recent' | 'stale' | 'offline';

export interface EldSyncState {
  tone: EldTone;
  label: string;
  dotClass: string;
  textClass: string;
  pulse: boolean;
}

export function getEldSyncState(lastUpdated: string | null | undefined): EldSyncState {
  if (!lastUpdated) {
    return {
      tone: 'offline',
      label: 'ELD offline',
      dotClass: 'bg-muted-foreground/50',
      textClass: 'text-muted-foreground',
      pulse: false,
    };
  }

  const ageMs = Date.now() - new Date(lastUpdated).getTime();
  const rel = formatDistanceToNowStrict(new Date(lastUpdated), { addSuffix: true });

  if (ageMs < 30 * 60 * 1000) {
    return {
      tone: 'live',
      label: `ELD live · ${rel}`,
      dotClass: 'bg-green-500',
      textClass: 'text-green-600 dark:text-green-400',
      pulse: true,
    };
  }
  if (ageMs < 4 * 60 * 60 * 1000) {
    return {
      tone: 'recent',
      label: `ELD synced ${rel}`,
      dotClass: 'bg-green-500',
      textClass: 'text-green-600 dark:text-green-400',
      pulse: false,
    };
  }
  if (ageMs < 14 * 60 * 60 * 1000) {
    return {
      tone: 'stale',
      label: `ELD stale · ${rel}`,
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-600 dark:text-amber-400',
      pulse: false,
    };
  }
  return {
    tone: 'offline',
    label: `ELD offline · ${rel}`,
    dotClass: 'bg-muted-foreground/50',
    textClass: 'text-muted-foreground',
    pulse: false,
  };
}

export interface EldDotProps {
  state: EldSyncState;
}
