"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { DayView } from "@/components/calendar/DayView";
import { WeekView } from "@/components/calendar/WeekView";
import { MonthView } from "@/components/calendar/MonthView";
import { EventDetailPopover } from "@/components/calendar/EventDetailPopover";
import { EventEditModal } from "@/components/calendar/EventEditModal";
import { QuickCreatePopover } from "@/components/calendar/QuickCreatePopover";
import { DraftModeBanner } from "@/components/calendar/DraftModeBanner";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useToast } from "@/components/ui/Toast";
import { useEvents, useCreateEvent, useUpdateEvent, useDeleteEvent } from "@/lib/hooks/useEvents";
import { useDraft, useApplyDraft, useDiscardDraft, useUndoDraft } from "@/lib/hooks/useAIPlan";
import { useDragToReschedule } from "@/lib/hooks/useDragToReschedule";
import { useResizeEvent } from "@/lib/hooks/useResizeEvent";
import { useDragToCreate } from "@/lib/hooks/useDragToCreate";
import { useCalendarUrlState } from "@/lib/calendar/useCalendarUrlState";
import { useNow } from "@/lib/calendar/useNow";
import { getWeekDays } from "@/lib/calendar/time";
import { DEFAULT_HOUR_HEIGHT, type CalendarView } from "@/lib/calendar/constants";
import type { CalendarEvent } from "@/lib/types/event";

function isCalendarView(v: string): v is CalendarView {
  return v === "day" || v === "week" || v === "month";
}

export default function CalendarPage() {
  const params = useParams<{ view: string }>();
  const router = useRouter();
  const { date, setDate } = useCalendarUrlState();
  const now = useNow();
  const { push } = useToast();

  const { data: events, isLoading } = useEvents();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  const [selected, setSelected] = React.useState<{ event: CalendarEvent; rect: DOMRect } | null>(null);
  const [editing, setEditing] = React.useState<CalendarEvent | null>(null);

  const view: CalendarView = isCalendarView(params.view) ? params.view : "week";

  const activeDraftBatchId = React.useMemo(
    () => events?.find((e) => e.isDraft)?.draftBatchId ?? null,
    [events],
  );
  const { data: draftData } = useDraft(activeDraftBatchId);
  const applyDraft = useApplyDraft();
  const discardDraft = useDiscardDraft();
  const undoDraft = useUndoDraft();

  const draftIndexById = React.useMemo(() => {
    const map = new Map<string, number>();
    draftData?.suggestions.forEach((s) => {
      if (s.eventId) map.set(s.eventId, s.index);
    });
    return map;
  }, [draftData]);

  const onApplyDraft = () => {
    if (!activeDraftBatchId) return;
    const id = activeDraftBatchId;
    applyDraft.mutate(id, {
      onSuccess: () => {
        push({
          message: "Plan applied to your calendar",
          variant: "undo",
          actionLabel: "Undo",
          onAction: () => undoDraft.mutate(id),
        });
      },
    });
  };

  const onDiscardDraft = () => {
    if (!activeDraftBatchId) return;
    discardDraft.mutate(activeDraftBatchId, {
      onSuccess: () => push({ message: "Draft discarded", variant: "alert" }),
    });
  };

  React.useEffect(() => {
    if (!isCalendarView(params.view)) {
      router.replace(`/app/calendar/week?date=${format(date, "yyyy-MM-dd")}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.view]);

  const commitReschedule = (eventId: string, newStart: Date, newEnd: Date) => {
    updateEvent.mutate({ id: eventId, patch: { start: newStart.toISOString(), end: newEnd.toISOString() } });
  };
  const reschedule = useDragToReschedule({ hourHeight: DEFAULT_HOUR_HEIGHT, onCommit: commitReschedule });
  const resize = useResizeEvent({ hourHeight: DEFAULT_HOUR_HEIGHT, onCommit: commitReschedule });
  const create = useDragToCreate({ hourHeight: DEFAULT_HOUR_HEIGHT });

  const onSelectEvent = (event: CalendarEvent, rect: DOMRect) => setSelected({ event, rect });

  const onDelete = () => {
    if (!selected) return;
    const deleted = selected.event;
    deleteEvent.mutate(deleted.id);
    setSelected(null);
    push({
      message: "Event deleted",
      variant: "undo",
      actionLabel: "Undo",
      onAction: () => {
        const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = deleted;
        createEvent.mutate(rest);
      },
    });
  };

  const onSave = (patch: { title: string; category: CalendarEvent["category"]; start: string; end: string }) => {
    if (!editing) return;
    updateEvent.mutate({ id: editing.id, patch });
    setEditing(null);
  };

  const onAddEventButton = () => {
    const start = new Date(date);
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    createEvent.mutate({
      title: "New event",
      start: start.toISOString(),
      end: end.toISOString(),
      category: "other",
      itemType: "event",
    });
  };

  if (isLoading || !events) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <CalendarToolbar
        date={date}
        view={view}
        onDateChange={setDate}
        onViewChange={(v) => router.push(`/app/calendar/${v}?date=${format(date, "yyyy-MM-dd")}`)}
        onAddEvent={onAddEventButton}
      />

      {activeDraftBatchId && draftData && (
        <DraftModeBanner
          changeCount={draftData.draft.changeCount}
          conflictCount={draftData.draft.conflictCount}
          applying={applyDraft.isPending}
          onApply={onApplyDraft}
          onDiscard={onDiscardDraft}
        />
      )}

      {view === "day" && (
        <DayView
          date={date}
          events={events}
          hourHeight={DEFAULT_HOUR_HEIGHT}
          now={now}
          selectedEventId={selected?.event.id ?? null}
          onSelectEvent={onSelectEvent}
          reschedule={reschedule}
          resize={resize}
          create={create}
          draftIndexById={draftIndexById}
        />
      )}
      {view === "week" && (
        <WeekView
          days={getWeekDays(date)}
          events={events}
          hourHeight={DEFAULT_HOUR_HEIGHT}
          now={now}
          selectedEventId={selected?.event.id ?? null}
          onSelectEvent={onSelectEvent}
          onOpenDay={(d) => {
            setDate(d);
            router.push(`/app/calendar/day?date=${format(d, "yyyy-MM-dd")}`);
          }}
          reschedule={reschedule}
          resize={resize}
          create={create}
          draftIndexById={draftIndexById}
        />
      )}
      {view === "month" && (
        <MonthView
          monthAnchor={date}
          events={events}
          onOpenDay={(d) => {
            setDate(d);
            router.push(`/app/calendar/day?date=${format(d, "yyyy-MM-dd")}`);
          }}
          onSelectEvent={(event) => setSelected({ event, rect: new DOMRect(window.innerWidth / 2 - 130, 160, 0, 0) })}
        />
      )}

      <EventDetailPopover
        event={selected?.event ?? null}
        anchorRect={selected?.rect ?? null}
        onClose={() => setSelected(null)}
        onEdit={() => {
          if (selected) setEditing(selected.event);
          setSelected(null);
        }}
        onDelete={onDelete}
      />

      <EventEditModal event={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} onSave={onSave} />

      {create.draft?.phase === "confirming" && (
        <QuickCreatePopover
          draft={create.draft}
          anchorRect={null}
          onConfirm={(title, start, end) => {
            createEvent.mutate({
              title,
              start: start.toISOString(),
              end: end.toISOString(),
              category: "other",
              itemType: "event",
            });
            create.cancelCreate();
          }}
          onCancel={create.cancelCreate}
        />
      )}
    </div>
  );
}
