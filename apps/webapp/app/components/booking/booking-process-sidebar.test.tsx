import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BookingProcessSidebar from "./booking-process-sidebar";

vi.mock("@radix-ui/react-dialog", () => ({
  Close: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));

vi.mock("../shared/button", () => ({
  Button: ({ children }: { children: ReactNode }) => (
    <button>{children}</button>
  ),
}));

vi.mock("../shared/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("BookingProcessSidebar", () => {
  it("shows requester copy that explains reservation and pickup are separate steps", () => {
    render(<BookingProcessSidebar viewer="requester" />);

    expect(
      screen.getByText(/Booking requests happen in two steps/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Request reservation/i).length).toBeGreaterThan(
      0
    );
    expect(screen.getByText(/Reservation confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/Pick up and check-out/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not mark the gear as picked up yet/i)
    ).toBeInTheDocument();
  });

  it("shows manager copy that explains reserve is schedule approval, not handoff", () => {
    render(<BookingProcessSidebar viewer="manager" />);

    expect(
      screen.getByText(
        /Bookings are intentionally split into reservation and check-out/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Reserve dates/i)).toBeInTheDocument();
    expect(screen.getByText(/Check out on handoff/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Reserve is the schedule approval step\. Check-out is the physical handoff step\./i
      )
    ).toBeInTheDocument();
  });
});
