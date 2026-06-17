#!/bin/sh -e

# GHCR Docker image entrypoint (Dockerfile.image).
#
# NOTE: We call `node` directly instead of `pnpm run start` because the
# production Docker image does not include pnpm-workspace.yaml. Without it,
# pnpm cannot resolve the workspace and the server fails to start.

./node_modules/.bin/prisma migrate deploy

NODE_ENV=production exec node ./build/server/index.js
