import type { EventContentArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import FullCalendar from "@fullcalendar/react";
import { useLoaderData } from "react-router";
import { ClientOnly } from "remix-utils/client-only";
import { useCanUseBookings } from "~/hooks/use-can-use-bookings";
import type { loader } from "~/routes/_layout+/home";
import { handleEventClick } from "~/utils/calendar";
import { PremiumFeatureTeaser } from "./premium-feature-teaser";
import { DashboardEmptyState } from "../dashboard/empty-state";
import FallbackLoading from "../dashboard/fallback-loading";
import { Button } from "../shared/button";

function renderHomeBookingEvent({ event, timeText }: EventContentArg) {
  return (
    <div className="truncate text-xs">
      {timeText ? <span className="font-medium">{timeText} </span> : null}
      <span>{event.title}</span>
    </div>
  );
}

export default function HomeBookingsCalendar() {
  const { bookingsCalendarEvents } = useLoaderData<typeof loader>();
  const canUseBookings = useCanUseBookings();

  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3 md:px-6">
        <div>
          <span className="text-[14px] font-semibold text-gray-900">
            Booking calendar
          </span>
          <p className="text-xs text-gray-500">Current month</p>
        </div>
        {canUseBookings ? (
          <Button
            to="/calendar"
            variant="block-link-gray"
            className="!mt-0 text-xs"
          >
            Open calendar
          </Button>
        ) : null}
      </div>

      {!canUseBookings ? (
        <div className="flex min-h-[420px] items-center justify-center p-4">
          <PremiumFeatureTeaser
            headline="See bookings on the calendar"
            description="Keep upcoming, active, and overdue bookings visible in one place."
          />
        </div>
      ) : bookingsCalendarEvents.length > 0 ? (
        <div className="p-4 md:p-6">
          <ClientOnly
            fallback={<FallbackLoading className="h-[420px] w-full" />}
          >
            {() => (
              <FullCalendar
                plugins={[dayGridPlugin]}
                initialView="dayGridMonth"
                headerToolbar={false}
                height="auto"
                firstDay={1}
                fixedWeekCount={false}
                dayMaxEvents={3}
                eventDisplay="block"
                events={bookingsCalendarEvents}
                eventContent={renderHomeBookingEvent}
                eventClick={handleEventClick}
                eventTimeFormat={{
                  hour: "numeric",
                  minute: "2-digit",
                  meridiem: "short",
                }}
              />
            )}
          </ClientOnly>
        </div>
      ) : (
        <div className="flex min-h-[420px] items-center justify-center p-4">
          <DashboardEmptyState
            text="No bookings on the calendar"
            subText="Reserved, active, and overdue bookings for this month will appear here."
            ctaTo="/bookings/new"
            ctaText="Create a booking"
          />
        </div>
      )}
    </div>
  );
}
