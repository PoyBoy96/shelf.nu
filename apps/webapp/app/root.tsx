import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Prisma } from "@prisma/client";
import nProgressStyles from "nprogress/nprogress.css?url";
import type {
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteLoaderData,
} from "react-router";
import { ErrorContent } from "./components/errors";
import BlockInteractions from "./components/layout/maintenance-mode";
import { SidebarTrigger } from "./components/layout/sidebar/sidebar";
import { Clarity } from "./components/marketing/clarity";
import { CloudflareWebAnalytics } from "./components/marketing/cloudflare-web-analytics";
import { config } from "./config/shelf.config";
import { useNprogress } from "./hooks/use-nprogress";
import { getUserByID } from "./modules/user/service.server";
import {
  DEFAULT_USER_THEME,
  getUserTheme,
  type UserTheme,
} from "./modules/user/theme";
import fontsStylesheetUrl from "./styles/fonts.css?url";
import globalStylesheetUrl from "./styles/global.css?url";
import nProgressCustomStyles from "./styles/nprogress.css?url";
import pmDocStylesheetUrl from "./styles/pm-doc.css?url";
import styles from "./tailwind.css?url";
import { ClientHintCheck, getClientHint } from "./utils/client-hints";
import { getBrowserEnv } from "./utils/env";
import { payload } from "./utils/http.server";
import { useNonce } from "./utils/nonce-provider";
import { PwaManagerProvider } from "./utils/pwa-manager";
import { splashScreenLinks } from "./utils/splash-screen-links";

export interface RootData {
  env: typeof getBrowserEnv;
  theme: UserTheme;
}

export const handle = {
  breadcrumb: () => <SidebarTrigger />,
};

export const links: LinksFunction = () => [
  { rel: "manifest", href: "/static/manifest.json" },
  { rel: "apple-touch-icon", href: config.faviconPath },
  { rel: "icon", href: config.faviconPath },
  ...splashScreenLinks,
  { rel: "stylesheet", href: styles },
  { rel: "stylesheet", href: fontsStylesheetUrl },
  { rel: "stylesheet", href: globalStylesheetUrl },
  { rel: "stylesheet", href: pmDocStylesheetUrl },
  { rel: "stylesheet", href: nProgressStyles },
  { rel: "stylesheet", href: nProgressCustomStyles },
];

export const meta: MetaFunction = () => [
  {
    title: "shelf.nu",
  },
];

const isMissingUserThemeColumnError = (cause: unknown) => {
  const seen = new Set<object>();
  let current: unknown = cause;

  while (typeof current === "object" && current !== null) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);

    if (
      "code" in current &&
      current.code === "P2022" &&
      "meta" in current &&
      JSON.stringify(current.meta).includes("User.theme")
    ) {
      return true;
    }

    if (
      "message" in current &&
      typeof current.message === "string" &&
      current.message.includes("User.theme")
    ) {
      return true;
    }

    current = "cause" in current ? current.cause : null;
  }

  return typeof cause === "string" && cause.includes("User.theme");
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  let theme = DEFAULT_USER_THEME;

  if (context.isAuthenticated) {
    const { userId } = context.getSession();

    try {
      const user = await getUserByID(userId, {
        select: { theme: true } satisfies Prisma.UserSelect,
      });
      theme = getUserTheme(user.theme);
    } catch (cause) {
      if (!isMissingUserThemeColumnError(cause)) {
        throw cause;
      }
    }
  }

  return payload({
    env: getBrowserEnv(),
    maintenanceMode: false,
    theme,
    requestInfo: {
      hints: getClientHint(request),
    },
  });
};

export const shouldRevalidate = () => false;

export function Layout({ children }: { children: ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const nonce = useNonce();
  const [hasCookies, setHasCookies] = useState(true);
  const theme = getUserTheme(data?.theme);
  const htmlClassName = ["overflow-hidden", theme === "dark" ? "dark" : ""]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    setHasCookies(navigator.cookieEnabled);
  }, []);

  return (
    <html lang="en" className={htmlClassName} data-theme={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <ClientHintCheck nonce={nonce} />
        <style data-fullcalendar />
        <Meta />
        <Links />
        <Clarity />
      </head>
      <body>
        <noscript>
          <BlockInteractions
            title="JavaScript is disabled"
            content="This website requires JavaScript to be enabled to function properly. Please enable JavaScript or change browser and try again."
            icon="x"
          />
        </noscript>

        {hasCookies ? (
          children
        ) : (
          <BlockInteractions
            title="Cookies are disabled"
            content="This website requires cookies to be enabled to function properly. Please enable cookies and try again."
            icon="x"
          />
        )}

        <ScrollRestoration />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.env = ${JSON.stringify(data?.env)}`,
          }}
        />
        <CloudflareWebAnalytics />
        <Scripts />
      </body>
    </html>
  );
}

function App() {
  useNprogress();
  const { maintenanceMode } = useLoaderData<typeof loader>();

  return maintenanceMode ? (
    <BlockInteractions
      title={"Maintenance is being performed"}
      content={
        "Apologies, we’re down for scheduled maintenance. Please try again later."
      }
      cta={{
        to: "https://www.shelf.nu/blog-categories/updates-maintenance",
        text: "Learn more",
      }}
      icon="tool"
    />
  ) : (
    <PwaManagerProvider>
      <Outlet />
    </PwaManagerProvider>
  );
}

export default App;

export const ErrorBoundary = () => <ErrorContent />;
