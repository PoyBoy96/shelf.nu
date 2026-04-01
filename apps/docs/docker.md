# Docker

> [!NOTE]
> The Docker configuration for shelf.nu is an effort powered by people within the community, done by [@anatolinicolae](https://github.com/anatolinicolae). Shelf Asset Management Inc. does not yet provide official support for Docker, but we will accept fixes and documentation at this time. Use at your own risk.

## Prerequisites

> [!IMPORTANT]
> If you want to run shelf via docker, there are still some prerequisites you need to meet. Because our docker setup doesn't currently support self-hosting supabase, you need to complete the steps below. This means you have to take care of setting up your Supabase environment, running migrations against your database, and making sure Supabase is configured based on our requirements.

1. [Local Development Guide](./local-development.md) - Setup your development environment
2. [Supabase Setup Guide](./supabase-setup.md) - Configure your database and authentication

This will make sure you have a DATABASE that you are ready to connect to.

## Instructions

### Option 1: Docker Compose (recommended)

1. Copy `.env.example` to `.env.docker` and fill in your Supabase/project secrets.
2. Start shelf in production mode:

```bash
docker compose --env-file .env.docker up -d --build
```

If port `3000` is already in use, override the host port:

```bash
SHELF_PORT=3001 docker compose --env-file .env.docker up -d --build
```

```powershell
$env:SHELF_PORT="3001"; docker compose --env-file .env.docker up -d --build
```

3. Open http://localhost:3000 (or your `SHELF_PORT` value if overridden)
4. Check logs if needed:

```bash
docker compose --env-file .env.docker logs -f shelf
```

5. Stop the container:

```bash
docker compose --env-file .env.docker down
```

`docker-compose.yml` builds from `apps/webapp/Dockerfile.image` and starts the production server on port `3000`.

The image does not run Prisma migrations automatically. Apply them separately before starting the container if your Supabase schema is not current yet.

> [!IMPORTANT]
> `SMTP_FROM` must be a single quoted value, for example:
> `SMTP_FROM="Team Shelf <hello@example.com>"`
> We pass `--env-file .env.docker` explicitly to avoid parsing issues with existing local `.env` files.

### Option 2: `docker run` (manual)

Use `docker run` and replace your environment variables:

```bash
docker run -d \
  --name "shelf" \
  -e "DATABASE_URL=postgres://USER:PASSWORD@POOLER_HOST:6543/DB_NAME?pgbouncer=true" \
  -e "DIRECT_URL=postgres://USER:PASSWORD@SESSION_OR_DIRECT_HOST:5432/DB_NAME" \
  -e 'SUPABASE_ANON_PUBLIC=your-anon-public-key' \
  -e 'SUPABASE_SERVICE_ROLE=your-service-role-key' \
  -e 'SUPABASE_URL=https://your-instance-name.supabase.co' \
  -e 'SESSION_SECRET=super-duper-s3cret' \
  -e 'SERVER_URL=http://localhost:3000' \
  -e 'MAPTILER_TOKEN=your-maptiler-token' \
  -e 'SMTP_HOST=mail.example.com' \
  -e 'SMTP_PORT=465' \
  -e 'SMTP_USER=some-email@example.com' \
  -e 'SMTP_FROM=Your Name from shelf.nu <your-email@shelf.nu>' \
  -e 'SMTP_PWD=super-safe-passw0rd' \
  -e 'INVITE_TOKEN_SECRET=another-super-duper-s3cret' \
  -e 'PORT=3000' \
  -p 3000:3000 \
  --restart unless-stopped \
  ghcr.io/shelf-nu/shelf.nu:latest
```

> [!NOTE]
> Replace the placeholder values with your actual configuration:
>
> - `USER`, `PASSWORD`, `DB_NAME` - Your Supabase database details
> - `POOLER_HOST` - The host from the pooled connection string (usually `*.pooler.supabase.com`)
> - `SESSION_OR_DIRECT_HOST` - The host for port `5432` (either Session pooler host or direct DB host)
> - `your-anon-public-key`, `your-service-role-key` - From Supabase API settings
> - `your-instance-name` - Your Supabase project reference
> - Other tokens and secrets as needed

`DATABASE_URL` and `DIRECT_URL` are mandatory when using Supabase Cloud. Runtime scheduler workers use `DIRECT_URL`, so make sure it points to your port `5432` connection (Session pooler or direct DB host). Learn more in the [Supabase Setup Guide](./supabase-setup.md).

## Development

> [!CAUTION]
> During development involving Dockerfile changes, make sure to **address the correct Dockerfile** in your builds:
>
> - Fly.io will be built via `apps/webapp/Dockerfile`
> - ghcr.io will be built via `apps/webapp/Dockerfile.image`

By default both Fly.io and Docker will build via `apps/webapp/Dockerfile` unless specifically instructed. Learn more [about Fly.io Config](https://fly.io/docs/reference/configuration/#specify-a-dockerfile) and [Docker image builds](https://docs.docker.com/reference/cli/docker/image/build/#file).

In order to build a local Docker image just as the one we provide for self-hosting, you'll have to build `apps/webapp/Dockerfile.image` using buildx as follows:

```bash
docker buildx build \
   --platform linux/amd64,linux/arm64 \
   --tag shelf-local \
   --file apps/webapp/Dockerfile.image .
```

Then running the locally-built image should be as simple as:

```bash
docker run -d \
   --name "shelf" \
   -e DATABASE_URL="your-database-url" \
   -e DIRECT_URL="your-direct-url" \
   -e SUPABASE_URL="your-supabase-url" \
   -e PORT="3000" \
   -p 3000:3000 \
   shelf-local
```

### ARM processors

You can also run shelf on ARM64 processors.

1. Linux / Pine A64

   ```bash
   docker run -it --rm --entrypoint /usr/bin/uname ghcr.io/shelf-nu/shelf.nu:latest -a
   # Expected output: Linux ... aarch64 GNU/Linux
   ```

2. MacOS / M1 Max

   ```bash
   docker run -it --rm --platform linux/arm64 --entrypoint /usr/bin/uname ghcr.io/shelf-nu/shelf.nu:latest -a
   # Expected output: Linux ... aarch64 GNU/Linux
   ```
