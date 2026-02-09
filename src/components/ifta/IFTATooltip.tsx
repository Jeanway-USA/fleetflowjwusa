import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface IFTATooltipProps {
  term: string;
}

const IFTA_TERMS: Record<string, string> = {
  'Taxable Miles': 'Miles driven on public roads that are subject to IFTA fuel tax. Usually equals total miles unless exempt miles apply.',
  'Tax Rate': 'The per-gallon diesel fuel tax rate set by each state. Rates vary by jurisdiction and may change quarterly.',
  'Tax Credit': 'Credit for fuel taxes already paid at the pump in this state. The more fuel you buy in a state, the higher your credit.',
  'Net Position': 'The difference between tax owed and tax credit. Red means you owe additional tax; green means you overpaid and get a credit.',
  'Tax Liability': 'Your total net tax position across all jurisdictions. This is the amount you owe (or are owed) for the quarter.',
  'Fleet MPG': 'Fleet miles per gallon — total miles driven divided by total gallons purchased. Used to calculate how many gallons were consumed in each state.',
  'Gal Consumed': 'Estimated gallons of fuel used in this state, calculated by dividing miles driven by your fleet MPG.',
  'Gal Purchased': 'Actual gallons of fuel bought at stations in this state, as recorded in your fuel purchases.',
  'Tax Owed': 'The fuel tax amount owed to this state based on gallons consumed and the state tax rate.',
  'Total Miles': 'The total number of miles driven in this jurisdiction during the quarter.',
  'Fuel Cost': 'The total dollar amount spent on fuel purchases in this state.',
  'Net Fuel Cost': 'Fuel cost after subtracting any NATS/fleet discounts. Reflects the actual amount paid.',
};

export function IFTATooltip({ term }: IFTATooltipProps) {
  const description = IFTA_TERMS[term];
  if (!description) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help inline-block ml-1 -mt-0.5" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}
