import type { PointAnchor } from '../state';
import type { CalEvent, EventKind } from '../types';
import { GoogleCalendars } from './GoogleCalendars';
import { HoursControl } from './HoursControl';
import { Legend } from './Legend';
import { Popover } from './Popover';

/** What to show, your hours, calendars — under the eye button on desktop, a sheet on a phone. */
export function FilterSheet({
  events,
  hidden,
  onToggleKind,
  onClose,
  anchor = null,
}: {
  events: CalEvent[];
  hidden: Set<EventKind>;
  onToggleKind: (k: EventKind) => void;
  onClose: () => void;
  anchor?: PointAnchor | null;
}) {
  return (
    <Popover anchor={anchor} width={340} estHeight={560} onClose={onClose} label="Show">
      <Legend events={events} hidden={hidden} onToggleKind={onToggleKind} touch first />
      <HoursControl />
      <GoogleCalendars />
    </Popover>
  );
}
