import AnnouncementBar from "~/components/dashboard/announcement-bar";
import AssetsByStatusChart from "~/components/dashboard/assets-by-status-chart";
import OnboardingChecklist from "~/components/dashboard/checklist";
import ActiveBookings from "~/components/home/active-bookings";
import AssetGrowthChart from "~/components/home/asset-growth-chart";
import HomeBookingsCalendar from "~/components/home/home-bookings-calendar";
import KpiCards from "~/components/home/kpi-cards";
import LocationDistribution from "~/components/home/location-distribution";
import OverdueBookings from "~/components/home/overdue-bookings";
import UpcomingBookings from "~/components/home/upcoming-bookings";
import UpcomingReminders from "~/components/home/upcoming-reminders";

export function HomeDashboardContent({
  skipOnboardingChecklist,
  checklistOptions,
}: {
  skipOnboardingChecklist: boolean;
  checklistOptions: Record<string, boolean>;
}) {
  const completedAllChecks = Object.values(checklistOptions).every(Boolean);

  if (!completedAllChecks && !skipOnboardingChecklist) {
    return <OnboardingChecklist />;
  }

  return (
    <div className="pb-8">
      <AnnouncementBar />

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <UpcomingBookings />
        <ActiveBookings />
        <OverdueBookings />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <HomeBookingsCalendar />
        </div>
        <UpcomingReminders />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AssetsByStatusChart />
        <LocationDistribution />
        <AssetGrowthChart />
      </div>

      <div className="mt-4">
        <KpiCards />
      </div>
    </div>
  );
}
