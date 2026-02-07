import { useState, ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Maximize2, X } from 'lucide-react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface ExpandableMapProps {
  /** Render function that receives expansion state and returns map JSX */
  renderMap: (opts: { isExpanded: boolean }) => ReactNode;
  /** Optional title shown in the expanded dialog (sr-only by default) */
  title?: string;
}

export function ExpandableMap({ renderMap, title = 'Map View' }: ExpandableMapProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Inline map with expand button overlay */}
      <div className="relative group">
        {renderMap({ isExpanded: false })}
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-2 right-2 z-10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shadow-md bg-background/90 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          aria-label="Expand map"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Fullscreen dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden [&_.leaflet-container]:z-0">
          <VisuallyHidden>
            <DialogTitle>{title}</DialogTitle>
          </VisuallyHidden>
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-3 right-3 z-[1000] h-8 w-8 shadow-md bg-background/90 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close map"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="w-full h-full">
            {open && renderMap({ isExpanded: true })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
