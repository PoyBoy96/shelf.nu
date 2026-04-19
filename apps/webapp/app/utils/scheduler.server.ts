import PgBoss from "pg-boss";
import { DATABASE_URL, DIRECT_URL, NODE_ENV } from "../utils/env";

type SchedulerWithFlags = PgBoss & {
  __shelfErrorHandlerAttached?: boolean;
};

export enum QueueNames {
  emailQueue = "email-queue",
  bookingQueue = "booking-queue",
  auditQueue = "audit-queue",
  assetsQueue = "assets-queue",
  addonTrialQueue = "addon-trial-queue",
}

let scheduler!: PgBoss;

declare global {
  var scheduler: PgBoss;
}

function getSchedulerConnectionString() {
  const connectionString = DIRECT_URL || DATABASE_URL;
  const [baseUrl, queryString] = connectionString.split("?");

  if (!queryString) return connectionString;

  // prisma-only flag; pg-boss uses node-postgres directly
  const normalizedQuery = queryString
    .split("&")
    .filter((parameter) => !parameter.startsWith("pgbouncer="))
    .join("&");

  return normalizedQuery ? `${baseUrl}?${normalizedQuery}` : baseUrl;
}

function attachSchedulerErrorHandler(instance: PgBoss) {
  const schedulerWithFlags = instance as SchedulerWithFlags;

  if (schedulerWithFlags.__shelfErrorHandlerAttached) return;

  schedulerWithFlags.__shelfErrorHandlerAttached = true;
  instance.on("error", (error) => {
    console.error("[scheduler] pg-boss error", error);
  });
}

export const init = async () => {
  if (!scheduler) {
    const commonAttributes = {
      connectionString: getSchedulerConnectionString(),
      newJobCheckIntervalSeconds: 60 * 5,
      noScheduling: true, //need to remove it, if we use cron schedulers in the future, but it comes with a cost of 2 additional polling every minute
      noSupervisor: NODE_ENV !== "production", // keep local dev from crashing on pg-boss maintenance polling against the shared DB
    };

    if (NODE_ENV === "production") {
      scheduler = new PgBoss({
        max: 4,
        ...commonAttributes,
      });
    } else {
      if (!global.scheduler) {
        global.scheduler = new PgBoss({
          max: 1,
          ...commonAttributes,
        });
      }
      scheduler = global.scheduler;
    }
    attachSchedulerErrorHandler(scheduler);
    await scheduler.start();
  }
  return;
};

export { scheduler };
