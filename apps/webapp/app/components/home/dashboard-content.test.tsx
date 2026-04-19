import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { HomeDashboardContent } from "./dashboard-content";

vi.mock("~/components/dashboard/announcement-bar", () => ({
  default: () => <div>Announcement</div>,
}));
vi.mock("~/components/dashboard/assets-by-status-chart", () => ({
  default: () => <div>Assets by status</div>,
}));
vi.mock("~/components/dashboard/checklist", () => ({
  default: () => <div>Checklist</div>,
}));
vi.mock("~/components/home/active-bookings", () => ({
  default: () => <div>Active bookings</div>,
}));
vi.mock("~/components/home/asset-growth-chart", () => ({
  default: () => <div>Asset growth</div>,
}));
vi.mock("~/components/home/home-bookings-calendar", () => ({
  default: () => <div>Booking calendar</div>,
}));
vi.mock("~/components/home/kpi-cards", () => ({
  default: () => <div>KPI cards</div>,
}));
vi.mock("~/components/home/location-distribution", () => ({
  default: () => <div>Location distribution</div>,
}));
vi.mock("~/components/home/overdue-bookings", () => ({
  default: () => <div>Overdue bookings</div>,
}));
vi.mock("~/components/home/upcoming-bookings", () => ({
  default: () => <div>Upcoming bookings</div>,
}));
vi.mock("~/components/home/upcoming-reminders", () => ({
  default: () => <div>Upcoming reminders</div>,
}));

describe("HomeDashboardContent", () => {
  it("keeps bookings first and swaps the removed asset-value widgets for a booking calendar", () => {
    render(
      <MemoryRouter>
        <HomeDashboardContent
          skipOnboardingChecklist={true}
          checklistOptions={{ assets: true }}
        />
      </MemoryRouter>
    );

    const upcomingBookings = screen.getByText("Upcoming bookings");
    const activeBookings = screen.getByText("Active bookings");
    const overdueBookings = screen.getByText("Overdue bookings");
    const bookingCalendar = screen.getByText("Booking calendar");
    const kpiCards = screen.getByText("KPI cards");

    expect(screen.queryByText("Custodians")).not.toBeInTheDocument();
    expect(screen.queryByText("Inventory value")).not.toBeInTheDocument();
    expect(screen.queryByText("Newest assets")).not.toBeInTheDocument();

    expect(
      upcomingBookings.compareDocumentPosition(bookingCalendar) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      activeBookings.compareDocumentPosition(kpiCards) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      overdueBookings.compareDocumentPosition(kpiCards) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shows onboarding when setup is still incomplete", () => {
    render(
      <MemoryRouter>
        <HomeDashboardContent
          skipOnboardingChecklist={false}
          checklistOptions={{ assets: false }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Checklist")).toBeInTheDocument();
    expect(screen.queryByText("Upcoming bookings")).not.toBeInTheDocument();
  });
});
