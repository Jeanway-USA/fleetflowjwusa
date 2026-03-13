import { useState, useCallback } from 'react';

interface UseProductTourOptions {
  tourId: string;
  totalSteps: number;
}

export function useProductTour({ tourId, totalSteps }: UseProductTourOptions) {
  const storageKey = `tour_completed_${tourId}`;
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const hasCompleted = () => localStorage.getItem(storageKey) === 'true';

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(s => s + 1);
    } else {
      localStorage.setItem(storageKey, 'true');
      setIsActive(false);
    }
  }, [currentStep, totalSteps, storageKey]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  }, [currentStep]);

  const skipTour = useCallback(() => {
    localStorage.setItem(storageKey, 'true');
    setIsActive(false);
  }, [storageKey]);

  const resetTour = useCallback(() => {
    localStorage.removeItem(storageKey);
    setCurrentStep(0);
  }, [storageKey]);

  return { currentStep, isActive, hasCompleted, startTour, nextStep, prevStep, skipTour, resetTour };
}
