import { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Eraser, Check } from 'lucide-react';

interface SignaturePadProps {
  onSignatureCapture: (dataUrl: string) => void;
  disabled?: boolean;
}

export function SignaturePad({ onSignatureCapture, disabled }: SignaturePadProps) {
  const padRef = useRef<SignatureCanvas>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Responsive sizing — react-signature-canvas needs fixed pixel dims for its canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) {
        const h = Math.max(180, Math.round((w * 3) / 8));
        setSize({ width: w, height: h });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleClear = () => {
    padRef.current?.clear();
    setHasSignature(false);
  };

  const handleConfirm = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;
    // Trim whitespace so the embedded PNG sits cleanly on the signature line.
    let dataUrl: string;
    try {
      dataUrl = pad.getTrimmedCanvas().toDataURL('image/png');
    } catch {
      dataUrl = pad.getCanvas().toDataURL('image/png');
    }
    onSignatureCapture(dataUrl);
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Sign Below</div>
      <div
        ref={containerRef}
        className="border rounded-lg overflow-hidden bg-white touch-none overscroll-contain"
        style={{ height: size.height || 180 }}
      >
        {size.width > 0 && (
          <SignatureCanvas
            ref={padRef}
            penColor="#000"
            minWidth={1.2}
            maxWidth={2.6}
            velocityFilterWeight={0.7}
            throttle={8}
            clearOnResize={false}
            onBegin={() => setHasSignature(true)}
            onEnd={() => setHasSignature(!padRef.current?.isEmpty())}
            canvasProps={{
              width: size.width,
              height: size.height,
              className: 'w-full h-full cursor-crosshair touch-none',
            }}
          />
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleClear}
          disabled={disabled || !hasSignature}
          className="w-full sm:w-auto h-12 sm:h-10 bg-white text-slate-900 border-slate-300 hover:bg-slate-100 hover:text-slate-900"
        >
          <Eraser className="h-4 w-4 mr-1" />
          Clear
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={disabled || !hasSignature}
          className="gradient-gold text-primary-foreground w-full sm:w-auto h-12 sm:h-10"
        >
          <Check className="h-4 w-4 mr-1" />
          Confirm Signature
        </Button>
      </div>
    </div>
  );
}
