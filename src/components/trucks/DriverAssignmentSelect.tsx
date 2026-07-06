import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DriverRow = {
  id: string;
  first_name: string;
  last_name: string;
};

interface Props {
  value: string | null | undefined;
  onChange: (driverId: string | null) => void;
}

export function DriverAssignmentSelect({ value, onChange }: Props) {
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-for-truck-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name')
        .order('first_name');
      if (error) throw error;
      return (data ?? []) as DriverRow[];
    },
  });

  const handleChange = (v: string) => {
    onChange(v === 'none' ? null : v);
  };

  return (
    <Select value={value || 'none'} onValueChange={handleChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select a driver" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No driver assigned</SelectItem>
        {drivers.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.first_name} {d.last_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
