import { useState, useCallback } from 'react';

interface UseProductTourOptions {
  tourId: string;
  totalSteps: number;
}

export function useProductTour({ tourId, totalSteps }: UseProductTourOptions) {
  const storageKey = `tour_completed_${tourId}`;
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const hasCompleted = useCallback(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  }, [storageKey]);

  const markCompleted = useCallback(() => {
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      // ignore quota / privacy mode
    }
    setIsActive(false);
  }, [storageKey]);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(s => s + 1);
    } else {
      markCompleted();
    }
  }, [currentStep, totalSteps, markCompleted]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  }, [currentStep]);

  const skipTour = useCallback(() => {
    markCompleted();
  }, [markCompleted]);

  const resetTour = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setCurrentStep(0);
  }, [storageKey]);

  // Mirror a server-side completion flag into localStorage so that drivers on
  // a fresh browser don't see the tour again after they've completed it elsewhere.
  const syncFromServer = useCallback((seen: boolean) => {
    if (!seen) return;
    try {
      if (localStorage.getItem(storageKey) !== 'true') {
        localStorage.setItem(storageKey, 'true');
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { currentStep, isActive, hasCompleted, startTour, nextStep, prevStep, skipTour, resetTour, syncFromServer };
}
