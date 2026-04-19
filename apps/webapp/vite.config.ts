import { existsSync } from "fs";
import { createRequire } from "module";
import { resolve, dirname } from "path";
import { init } from "@paralleldrive/cuid2";
import { reactRouter } from "@react-router/dev/vite";
import { reactRouterHonoServer } from "react-router-hono-server/dev";
import { defineConfig, loadEnv } from "vite";
import { cjsInterop } from "vite-plugin-cjs-interop";
import tsconfigPaths from "vite-tsconfig-paths";

const require = createRequire(import.meta.url);

const createHash = init({
  length: 8,
});

const buildHash = process.env.BUILD_HASH || createHash();
const webappDir = dirname(require.resolve("./package.json"));
const workspaceRoot = resolve(webappDir, "../..");

// Resolve the generated Prisma browser entry that contains enum runtime values.
// In pnpm, .prisma/client lives inside the @prisma/client store directory,
// not at the project root, so we resolve the path dynamically.
const prismaClientDir = dirname(require.resolve("@prisma/client/package.json"));
const prismaClientIndexBrowser = resolve(
  prismaClientDir,
  "../../.prisma/client/index-browser.js"
);

// Fail fast if the Prisma browser bundle is missing. Without it, enums like
// OrganizationRoles silently resolve to `undefined` in the browser at runtime.
if (!existsSync(prismaClientIndexBrowser)) {
  throw new Error(
    `Prisma browser bundle not found at ${prismaClientIndexBrowser}. ` +
      `Run "prisma generate" or check that the .prisma/client path is correct.`
  );
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, "");
  const devHost = env.DEV_HOST || "0.0.0.0";
  const devPort = Number(env.DEV_PORT || env.PORT || 3001);
  const useHttps = env.DEV_HTTPS !== "false";
  const allowedHosts =
    env.DEV_ALLOWED_HOSTS === "all" || !env.DEV_ALLOWED_HOSTS
      ? true
      : env.DEV_ALLOWED_HOSTS.split(",")
          .map((host) => host.trim())
          .filter(Boolean);
  const httpsConfig = useHttps
    ? {
        key: "./.cert/key.pem",
        cert: "./.cert/cert.pem",
      }
    : undefined;

  return {
    server: {
      host: devHost,
      port: Number.isFinite(devPort) ? devPort : 3001,
      strictPort: true,
      https: httpsConfig,
      allowedHosts,
      warmup: {
        clientFiles: [
          "./app/entry.client.tsx",
          "./app/root.tsx",
          "./app/routes/**/*.tsx",
          "./app/routes/**/*.ts",
          "!./app/routes/**/*.test.ts",
          "!./app/routes/**/*.test.tsx",
          "!./app/routes/**/*.test.server.ts",
        ],
      },
    },
    optimizeDeps: {
      include: ["./app/routes/**/*.tsx", "./app/routes/**/*.ts"],
    },
    build: {
      target: "ES2022",
      assetsDir: `file-assets`,
      rollupOptions: {
        output: {
          entryFileNames: `file-assets/${buildHash}/[name]-[hash].js`,
          chunkFileNames() {
            return `file-assets/${buildHash}/[name]-[hash].js`;
          },
          assetFileNames() {
            return `file-assets/${buildHash}/[name][extname]`;
          },
        },
      },
    },
    envDir: workspaceRoot,
    ssr: {
      noExternal: ["@shelf/database"],
    },
    resolve: {
      alias: {
        ".prisma/client/index-browser": prismaClientIndexBrowser,
        // Use lottie_light version to avoid eval warnings
        "lottie-web": "lottie-web/build/player/lottie_light.js",
      },
    },
    plugins: [
      cjsInterop({
        // List of CJS dependencies that require interop
        dependencies: ["react-microsoft-clarity", "@markdoc/markdoc"],
      }),
      reactRouterHonoServer({
        serverEntryPoint: "./server/index.ts",
      }),
      reactRouter(),
      tsconfigPaths(),
    ],
  };
});
