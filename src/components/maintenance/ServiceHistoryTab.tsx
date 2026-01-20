import { useState } from 'react';
import { useServiceHistory } from '@/hooks/useMaintenanceData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Search, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';

interface ServiceHistoryTabProps {
  onViewTruck: (truckId: string) => void;
}

export function ServiceHistoryTab({ onViewTruck }: ServiceHistoryTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  
  const { data: history, isLoading } = useServiceHistory(debouncedQuery || undefined);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setDebouncedQuery(value);
  }, 300);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    debouncedSearch(value);
  };

  const getServiceTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      pm: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      repair: 'bg-red-100 text-red-800 border-red-300',
      tire: 'bg-slate-100 text-slate-800 border-slate-300',
      inspection: 'bg-blue-100 text-blue-800 border-blue-300',
      'oil change': 'bg-amber-100 text-amber-800 border-amber-300',
    };
    const normalizedType = type.toLowerCase();
    return (
      <Badge variant="outline" className={cn('capitalize', colors[normalizedType] || '')}>
        {type}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by description, service type, vendor..."
          className="pl-10"
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !history?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <History className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No Service History</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery 
              ? 'No records match your search criteria.'
              : 'Completed work orders and maintenance logs will appear here.'}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Unit #</TableHead>
                <TableHead>Service Type</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead className="max-w-[300px]">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map(item => (
                <TableRow 
                  key={`${item.source}-${item.id}`}
                  className="cursor-pointer"
                >
                  <TableCell>
                    {format(new Date(item.date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="font-medium">{item.unitNumber}</TableCell>
                  <TableCell>{getServiceTypeBadge(item.serviceType)}</TableCell>
                  <TableCell>{item.vendor || '-'}</TableCell>
                  <TableCell>
                    {item.cost 
                      ? `$${item.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : '-'}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {item.description || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
