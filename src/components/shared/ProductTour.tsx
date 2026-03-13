import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { TourStep } from '@/lib/tour-steps';

interface ProductTourProps {
  steps: TourStep[];
  currentStep: number;
  isActive: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const PAD = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_WIDTH = 340;

function getPlacement(targetRect: Rect, placement?: string) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Auto-detect best placement
  const preferred = placement || 'bottom';
  const spaceBelow = vh - targetRect.bottom;
  const spaceAbove = targetRect.top;
  const spaceRight = vw - targetRect.right;
  const spaceLeft = targetRect.left;

  if (preferred === 'bottom' && spaceBelow > 200) return 'bottom';
  if (preferred === 'top' && spaceAbove > 200) return 'top';
  if (preferred === 'right' && spaceRight > TOOLTIP_WIDTH + 40) return 'right';
  if (preferred === 'left' && spaceLeft > TOOLTIP_WIDTH + 40) return 'left';

  // Fallback
  if (spaceBelow > 200) return 'bottom';
  if (spaceAbove > 200) return 'top';
  if (spaceRight > TOOLTIP_WIDTH + 40) return 'right';
  return 'left';
}

function getTooltipStyle(targetRect: Rect, placement: string): React.CSSProperties {
  const centerX = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2;
  const clampedX = Math.max(12, Math.min(centerX, window.innerWidth - TOOLTIP_WIDTH - 12));

  switch (placement) {
    case 'bottom':
      return { position: 'fixed', top: targetRect.bottom + PAD + TOOLTIP_GAP, left: clampedX, width: TOOLTIP_WIDTH };
    case 'top':
      return { position: 'fixed', bottom: window.innerHeight - targetRect.top + PAD + TOOLTIP_GAP, left: clampedX, width: TOOLTIP_WIDTH };
    case 'right':
      return { position: 'fixed', top: targetRect.top, left: targetRect.right + PAD + TOOLTIP_GAP, width: TOOLTIP_WIDTH };
    case 'left':
      return { position: 'fixed', top: targetRect.top, right: window.innerWidth - targetRect.left + PAD + TOOLTIP_GAP, width: TOOLTIP_WIDTH };
    default:
      return { position: 'fixed', top: targetRect.bottom + PAD + TOOLTIP_GAP, left: clampedX, width: TOOLTIP_WIDTH };
  }
}

function buildClipPath(rect: Rect) {
  const t = rect.top - PAD;
  const l = rect.left - PAD;
  const r = rect.right + PAD;
  const b = rect.bottom + PAD;
  // Polygon with rectangular cutout
  return `polygon(0% 0%, 0% 100%, ${l}px 100%, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px 100%, 100% 100%, 100% 0%)`;
}

export function ProductTour({ steps, currentStep, isActive, onNext, onPrev, onSkip }: ProductTourProps) {
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const step = steps[currentStep];

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.targetSelector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Small delay after scroll to re-measure
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
      });
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (!isActive) return;
    measure();

    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);

    // Observe target for size changes
    const el = step ? document.querySelector(step.targetSelector) : null;
    if (el) {
      observerRef.current = new ResizeObserver(onResize);
      observerRef.current.observe(el);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      observerRef.current?.disconnect();
    };
  }, [isActive, currentStep, measure, step]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, onSkip, onNext, onPrev]);

  if (!isActive || !step) return null;

  const placement = targetRect ? getPlacement(targetRect, step.placement) : 'bottom';
  const tooltipStyle = targetRect ? getTooltipStyle(targetRect, placement) : { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: TOOLTIP_WIDTH };
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  return createPortal(
    <>
      {/* Overlay with spotlight cutout */}
      <div
        className="fixed inset-0 z-[9999] transition-all duration-300"
        style={{
          background: 'rgba(0,0,0,0.6)',
          clipPath: targetRect ? buildClipPath(targetRect) : undefined,
        }}
        onClick={onSkip}
      />

      {/* Spotlight border glow */}
      {targetRect && (
        <div
          className="fixed z-[9999] rounded-lg ring-2 ring-primary/60 pointer-events-none transition-all duration-300"
          style={{
            top: targetRect.top - PAD,
            left: targetRect.left - PAD,
            width: targetRect.width + PAD * 2,
            height: targetRect.height + PAD * 2,
            boxShadow: '0 0 0 4px hsl(var(--primary) / 0.15)',
          }}
        />
      )}

      {/* Tooltip card */}
      <Card
        className="z-[10000] shadow-xl border-primary/20 animate-fade-in"
        style={tooltipStyle}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Step {currentStep + 1} of {steps.length}
              </p>
              <h4 className="text-sm font-semibold text-foreground mt-0.5">{step.title}</h4>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onSkip}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 pt-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentStep
                    ? 'w-4 bg-primary'
                    : i < currentStep
                    ? 'w-1.5 bg-primary/40'
                    : 'w-1.5 bg-muted-foreground/20'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onSkip}>
              Skip Tour
            </Button>
            <div className="flex gap-2">
              {!isFirst && (
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={onPrev}>
                  Back
                </Button>
              )}
              <Button size="sm" className="text-xs h-7" onClick={onNext}>
                {isLast ? 'Finish' : 'Next'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>,
    document.body
  );
}
