import { Search, Filter, LayoutGrid, List, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toggle } from '@/components/ui/toggle';

export type HealthStatus = 'all' | 'overdue' | 'due-soon' | 'on-track';
export type ManufacturerFilter = 'all' | 'freightliner' | 'other';

interface PMScheduleFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: HealthStatus;
  onStatusFilterChange: (value: HealthStatus) => void;
  manufacturerFilter: ManufacturerFilter;
  onManufacturerFilterChange: (value: ManufacturerFilter) => void;
  compactMode: boolean;
  onCompactModeChange: (value: boolean) => void;
  hideHealthy: boolean;
  onHideHealthyChange: (value: boolean) => void;
}

const statusLabels: Record<HealthStatus, string> = {
  'all': 'All Statuses',
  'overdue': 'Overdue',
  'due-soon': 'Due Soon',
  'on-track': 'On Track',
};

const manufacturerLabels: Record<ManufacturerFilter, string> = {
  'all': 'All Makes',
  'freightliner': 'Freightliner',
  'other': 'Other',
};

export function PMScheduleFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  manufacturerFilter,
  onManufacturerFilterChange,
  compactMode,
  onCompactModeChange,
  hideHealthy,
  onHideHealthyChange,
}: PMScheduleFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 pb-4">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search unit number..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Status Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            {statusLabels[statusFilter]}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup 
            value={statusFilter} 
            onValueChange={(v) => onStatusFilterChange(v as HealthStatus)}
          >
            <DropdownMenuRadioItem value="all">All Statuses</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="overdue">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Overdue
              </span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="due-soon">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Due Soon
              </span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="on-track">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                On Track
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Manufacturer Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            {manufacturerLabels[manufacturerFilter]}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup 
            value={manufacturerFilter} 
            onValueChange={(v) => onManufacturerFilterChange(v as ManufacturerFilter)}
          >
            <DropdownMenuRadioItem value="all">All Makes</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="freightliner">Freightliner</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="other">Other</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Compact Mode Toggle */}
      <Toggle
        pressed={compactMode}
        onPressedChange={onCompactModeChange}
        aria-label="Toggle compact mode"
        className="gap-2"
      >
        {compactMode ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
        <span className="hidden sm:inline">Compact</span>
      </Toggle>

      {/* Hide Healthy Toggle */}
      <Toggle
        pressed={hideHealthy}
        onPressedChange={onHideHealthyChange}
        aria-label="Hide healthy trucks"
        className="gap-2"
      >
        <span className="hidden sm:inline">Hide OK</span>
        <span className="sm:hidden">OK</span>
      </Toggle>
    </div>
  );
}
