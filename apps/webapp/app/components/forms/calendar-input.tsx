import type React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { DayPicker } from "react-day-picker";

import { tw } from "~/utils/tw";

type CalendarProps = {
  className?: any;
  classNames?: any;
  showOutsideDays?: boolean;
  selected: any;
  onSelect: any;
  [x: string]: any;
};

const Calendar: React.ForwardRefRenderFunction<HTMLElement, CalendarProps> = (
  {
    className,
    classNames,
    showOutsideDays = true,
    selected,
    onSelect,
    ...props
  },
  _ref // This is the forwarded ref
) => (
  <>
    <DayPicker
      onSelect={(_range: unknown, d: Date) => {
        onSelect(d);
      }}
      selected={selected}
      showOutsideDays={showOutsideDays}
      className={tw(
        "z-50 rounded-md border border-gray-200 bg-white p-3 text-gray-900 shadow-lg",
        className
      )}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium text-gray-900",
        nav: "space-x-1 flex items-center",
        nav_button: tw(
          "size-7 rounded-md bg-transparent p-0 text-gray-600 opacity-80 hover:bg-gray-50 hover:text-gray-900 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "w-8 rounded-md text-[0.8rem] font-normal text-gray-500",
        row: "flex w-full mt-2",
        cell: tw(
          "[&:has([aria-selected])]:bg-accent relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        day: tw(
          "size-8 rounded-md p-0 font-normal text-gray-900 aria-selected:opacity-100"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-gray-50 text-gray-900",
        day_outside: "text-gray-400 opacity-60",
        day_disabled: "text-gray-400 opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          ),
      }}
      {...props}
    />
  </>
);

export { Calendar };
