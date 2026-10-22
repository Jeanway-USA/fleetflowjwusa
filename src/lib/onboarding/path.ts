/** Where a person who still has onboarding to do should go: drivers have their own flow, everyone else uses staff onboarding. */
export const DRIVER_ONBOARDING_PATH = '/driver/onboarding';
export const STAFF_ONBOARDING_PATH = '/staff/onboarding';

export function onboardingPath(isDriver: boolean): string {
  return isDriver ? DRIVER_ONBOARDING_PATH : STAFF_ONBOARDING_PATH;
}

export function isOnboardingPath(pathname: string): boolean {
  return pathname.startsWith(DRIVER_ONBOARDING_PATH) || pathname.startsWith(STAFF_ONBOARDING_PATH);
}
