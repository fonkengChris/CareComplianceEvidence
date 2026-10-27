import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ShiftMonitorTable } from '../components/ShiftMonitorTable';
import { Card, CardContent } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { fetchHomes } from '../lib/homes';

/**
 * Manager shift monitor: who is on shift right now across every home (or one), refreshed
 * live. A manager who spots someone checked in without authority ends the shift and signs
 * them out from here — every such action lands in the audit trail.
 */
export default function ShiftsPage() {
  const [homeId, setHomeId] = useState('');
  const homes = useQuery({ queryKey: ['homes', 'active'], queryFn: () => fetchHomes('active') });

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shift monitor</h1>
        <p className="text-sm text-muted-foreground">
          Staff on shift right now. Updates every 30 seconds. If someone shouldn't be on shift, end
          it and sign them out.
        </p>
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="shift-monitor-home">Home</Label>
        <Select id="shift-monitor-home" value={homeId} onChange={(e) => setHomeId(e.target.value)}>
          <option value="">All homes</option>
          {(homes.data ?? []).map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="py-5">
          <ShiftMonitorTable homeId={homeId || undefined} />
        </CardContent>
      </Card>
    </section>
  );
}
