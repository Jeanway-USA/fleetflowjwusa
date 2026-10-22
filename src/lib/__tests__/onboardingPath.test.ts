import { describe, expect, it } from 'vitest';
import { isOnboardingPath, onboardingPath } from '@/lib/onboarding/path';

describe('onboardingPath', () => {
  it('sends drivers to the driver flow and everyone else to staff onboarding', () => {
    expect(onboardingPath(true)).toBe('/driver/onboarding');
    expect(onboardingPath(false)).toBe('/staff/onboarding');
  });

  it('recognises both onboarding pages, including query strings, and nothing else', () => {
    expect(isOnboardingPath('/driver/onboarding')).toBe(true);
    expect(isOnboardingPath('/staff/onboarding')).toBe(true);
    expect(isOnboardingPath('/onboarding')).toBe(false);
    expect(isOnboardingPath('/drivers')).toBe(false);
  });
});
