import { Close } from "@radix-ui/react-dialog";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, ClockIcon, InfoIcon } from "lucide-react";
import { tw } from "~/utils/tw";
import { XIcon } from "../icons/library";
import { Button } from "../shared/button";
import { Sheet, SheetContent, SheetTrigger } from "../shared/sheet";

type BookingProcessSidebarProps = {
  className?: string;
  viewer?: "requester" | "manager";
};

type ProcessItem = {
  icon: LucideIcon;
  title: string;
  description: string;
  iconClassName: string;
};

const PROCESS_CONTENT: Record<
  NonNullable<BookingProcessSidebarProps["viewer"]>,
  {
    intro: string;
    items: Array<ProcessItem>;
    notes: string[];
  }
> = {
  requester: {
    intro:
      "Booking requests happen in two steps: reserve the dates first, then pick up the gear when an administrator checks it out.",
    items: [
      {
        icon: ClockIcon,
        title: "Request reservation",
        description:
          'Fill in the booking details, add your assets, then click "Request reservation" to hold the dates for review.',
        iconClassName: "bg-primary-100 text-primary-500",
      },
      {
        icon: InfoIcon,
        title: "Reservation confirmed",
        description:
          "Once the request is approved, the booking becomes reserved. This saves the dates, but the gear has not been handed over yet.",
        iconClassName: "bg-warning-100 text-warning-500",
      },
      {
        icon: ArrowRight,
        title: "Pick up and check-out",
        description:
          "On the booking start date, an administrator checks out the gear during handoff. That starts the active booking period.",
        iconClassName: "bg-success-100 text-success-600",
      },
      {
        icon: ArrowLeft,
        title: "Return and check-in",
        description:
          "When you bring the gear back, an administrator checks it back in to complete the booking.",
        iconClassName: "bg-gray-100 text-gray-700",
      },
    ],
    notes: [
      "A reserved booking blocks the dates, but it does not mark the gear as picked up yet.",
      "If you need to extend your booking, contact an administrator before the end date.",
      "Administrators have final say on booking approvals based on availability and priorities.",
    ],
  },
  manager: {
    intro:
      "Bookings are intentionally split into reservation and check-out so the calendar hold and the physical handoff happen at the right times.",
    items: [
      {
        icon: ClockIcon,
        title: "Save or update draft",
        description:
          "Build the booking, confirm the dates, and make sure the selected assets are correct before reserving it.",
        iconClassName: "bg-primary-100 text-primary-500",
      },
      {
        icon: InfoIcon,
        title: "Reserve dates",
        description:
          "Reserve locks the booking into the schedule and prevents conflicting use, but it does not check the gear out yet.",
        iconClassName: "bg-warning-100 text-warning-500",
      },
      {
        icon: ArrowRight,
        title: "Check out on handoff",
        description:
          "Use check-out when the custodian actually receives the gear. That starts the active booking and updates live availability.",
        iconClassName: "bg-success-100 text-success-600",
      },
      {
        icon: ArrowLeft,
        title: "Check in on return",
        description:
          "When the gear comes back, check it in to complete the booking and return the assets to available status.",
        iconClassName: "bg-gray-100 text-gray-700",
      },
    ],
    notes: [
      "Reserve is the schedule approval step. Check-out is the physical handoff step.",
      "Early check-out can adjust the booking start time when gear leaves sooner than planned.",
      "Use check-in when the gear is returned so inventory status stays accurate.",
    ],
  },
};

export default function BookingProcessSidebar({
  className,
  viewer = "requester",
}: BookingProcessSidebarProps) {
  const content = PROCESS_CONTENT[viewer];
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="block-link-gray" className={"mt-0"}>
          <div className="flex items-center gap-2">
            <InfoIcon className="size-4" />
            How bookings work
          </div>
        </Button>
      </SheetTrigger>

      <SheetContent
        hideCloseButton
        className={tw("border-l-0 bg-white p-0", className)}
      >
        <div className="flex items-center justify-between bg-primary-500 p-4 text-white">
          <div className="flex items-center gap-2 text-lg font-bold">
            <InfoIcon className="size-4" />
            Booking Process
          </div>

          <Close className="opacity-70 transition-opacity hover:opacity-100">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </Close>
        </div>

        <div className="p-4">
          <p className="mb-8 border-l-4 border-primary-500 bg-primary-50 p-2 text-primary-500">
            {content.intro}
          </p>

          <div className="mb-8 flex flex-col gap-4">
            {content.items.map((item, i) => (
              <div key={i} className="flex items-start gap-4">
                <div
                  className={tw(
                    "flex items-center justify-center rounded-full p-4",
                    item.iconClassName
                  )}
                >
                  {}
                  <item.icon className="size-5" />
                </div>

                <div>
                  <h3 className="mb-1">
                    {i + 1}. {item.title}
                  </h3>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md bg-gray-50 p-4">
            <h3 className="mb-1">Important Notes</h3>

            <ul className="list-inside list-disc">
              {content.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
