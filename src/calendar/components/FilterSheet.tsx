import type { CalEvent, EventKind } from '../types';
import { GoogleCalendars } from './GoogleCalendars';
import { HoursControl } from './HoursControl';
import { Legend } from './Legend';
import { Popover } from './Popover';

/** Phone counterpart of the rail: what to show, your hours, calendars. */
export function FilterSheet({
  events,
  hidden,
  onToggleKind,
  onClose,
}: {
  events: CalEvent[];
  hidden: Set<EventKind>;
  onToggleKind: (k: EventKind) => void;
  onClose: () => void;
}) {
  return (
    <Popover anchor={null} onClose={onClose} label="Show">
      <Legend events={events} hidden={hidden} onToggleKind={onToggleKind} touch />
      <HoursControl />
      <GoogleCalendars />
    </Popover>
  );
}
