import { Info, Target, Shield, ClipboardCheck, DollarSign } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function ScoringMethodology() {
  const [isOpen, setIsOpen] = useState(false);

  const categories = [
    {
      icon: Target,
      label: 'Productivity',
      weight: '25%',
      description: 'Based on loads completed. Delivering 10+ loads per month earns a full 100% score.',
      color: 'text-primary',
    },
    {
      icon: Shield,
      label: 'Safety',
      weight: '25%',
      description: 'Starts at 100%. Each incident deducts 10 points; major or critical incidents deduct an additional 20 points.',
      color: 'text-success',
    },
    {
      icon: ClipboardCheck,
      label: 'Compliance',
      weight: '25%',
      description: 'Percentage of DVIR inspections completed without defects found.',
      color: 'text-warning',
    },
    {
      icon: DollarSign,
      label: 'Revenue',
      weight: '25%',
      description: 'Based on net revenue generated. Earning $20,000+ per month earns a full 100% score.',
      color: 'text-success',
    },
  ];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-6">
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Info className="h-4 w-4" />
          How Scores Are Calculated
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <Card className="card-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Each driver receives an <strong>Overall Score</strong> calculated as an equal-weighted average of four categories:
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((cat) => (
                <div key={cat.label} className="flex gap-3 p-3 rounded-lg bg-muted/50">
                  <cat.icon className={`h-5 w-5 mt-0.5 shrink-0 ${cat.color}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{cat.label}</span>
                      <span className="text-xs text-muted-foreground">({cat.weight})</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{cat.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
