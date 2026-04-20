import ShelfLogo from "~/components/brand/logo";
import { config } from "~/config/shelf.config";
import { tw } from "~/utils/tw";

const DEFAULT_SHELF_LOGO_PATH = {
  fullLogo: "/static/images/logo-full-color(x2).png",
  symbol: "/static/images/shelf-symbol.png",
} as const;

const DEFAULT_LOGO_TYPE_COLOR = "rgb(var(--color-gray-900))";
const DEFAULT_LOGO_ICON_BG_COLOR = "rgb(var(--color-primary-500))";
const DEFAULT_LOGO_ICON_SHELFS_COLOR = "#fff";

const isCustomLogoPath =
  config.logoPath &&
  (config.logoPath.fullLogo !== DEFAULT_SHELF_LOGO_PATH.fullLogo ||
    config.logoPath.symbol !== DEFAULT_SHELF_LOGO_PATH.symbol);

/**
 * Logo shown in the sidebar
 * If a custom logo is used, we dynamically show that or the symbol depending on {optimisticMinimizedSidebar}
 */
export const ShelfSidebarLogo = ({ minimized }: { minimized: boolean }) => {
  const { logoPath } = config;

  /** If a custom logo is used, we just use that instead of doing the dynamic shelf typography */
  if (logoPath && isCustomLogoPath) {
    return minimized ? (
      <img
        src={logoPath.symbol}
        alt="Shelf Logo"
        className="mx-1.5 inline h-[32px] transition duration-150 ease-linear"
      />
    ) : (
      <img
        src={logoPath.fullLogo}
        alt="Shelf Logo"
        className="mx-1.5 inline h-[32px] transition duration-150 ease-linear"
      />
    );
  }

  return minimized ? (
    <ShelfLogo
      variant="symbol"
      aria-label="Shelf Logo"
      className="mx-1.5 inline h-[32px] w-auto transition duration-150 ease-linear"
      iconBgColor={DEFAULT_LOGO_ICON_BG_COLOR}
      iconShelfsColor={DEFAULT_LOGO_ICON_SHELFS_COLOR}
      typeColor={DEFAULT_LOGO_TYPE_COLOR}
    />
  ) : (
    <ShelfLogo
      aria-label="Shelf Logo"
      className="mx-1.5 inline h-[32px] w-auto transition duration-150 ease-linear"
      iconBgColor={DEFAULT_LOGO_ICON_BG_COLOR}
      iconShelfsColor={DEFAULT_LOGO_ICON_SHELFS_COLOR}
      typeColor={DEFAULT_LOGO_TYPE_COLOR}
    />
  );
};

/**
 * Logo shown in the header for mobile screen sizes
 */
export const ShelfMobileLogo = () => {
  const { logoPath } = config;

  if (logoPath && isCustomLogoPath) {
    return <img src={logoPath.fullLogo} alt="Shelf Logo" className="h-full" />;
  }

  return (
    <ShelfLogo
      aria-label="Shelf Logo"
      className="h-full w-auto"
      iconBgColor={DEFAULT_LOGO_ICON_BG_COLOR}
      iconShelfsColor={DEFAULT_LOGO_ICON_SHELFS_COLOR}
      typeColor={DEFAULT_LOGO_TYPE_COLOR}
    />
  );
};

/**
 * Lego symbol
 */
export const ShelfSymbolLogo = ({ className }: { className?: string }) => {
  const { logoPath } = config;
  const classes = tw("mx-auto mb-2 size-12", className);

  if (logoPath && isCustomLogoPath) {
    return <img src={logoPath.symbol} alt="Shelf Logo" className={classes} />;
  }

  return (
    <ShelfLogo
      variant="symbol"
      aria-label="Shelf Logo"
      className={tw("w-auto", classes)}
      iconBgColor={DEFAULT_LOGO_ICON_BG_COLOR}
      iconShelfsColor={DEFAULT_LOGO_ICON_SHELFS_COLOR}
      typeColor={DEFAULT_LOGO_TYPE_COLOR}
    />
  );
};

/**
 * Full logo
 */
export const ShelfFullLogo = ({ className }: { className?: string }) => {
  const { logoPath } = config;
  const classes = tw(className);

  if (logoPath && isCustomLogoPath) {
    return <img src={logoPath.fullLogo} alt="Shelf Logo" className={classes} />;
  }

  return (
    <ShelfLogo
      aria-label="Shelf Logo"
      className={tw("w-auto", classes)}
      iconBgColor={DEFAULT_LOGO_ICON_BG_COLOR}
      iconShelfsColor={DEFAULT_LOGO_ICON_SHELFS_COLOR}
      typeColor={DEFAULT_LOGO_TYPE_COLOR}
    />
  );
};
