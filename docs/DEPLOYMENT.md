# Deployment

Three environments, all running the same application code:

| | Dev | Staging | Prod |
|---|---|---|---|
| App | `npm run dev` on the host (nodemon) | Docker, image pulled from GHCR | Docker, image pulled from GHCR |
| Postgres | `docker compose up -d` (`docker-compose.yml`) | Docker, in `docker-compose.staging.yml` | External, managed |
| Storage | Local disk (`uploads/`) | S3 / S3-compatible (e.g. MinIO) | S3 / S3-compatible |
| Reverse proxy | none | your own, in front of the published port | External Traefik (label discovery) |
| Metrics scrape | manual `curl localhost:3001/metrics` | your choice | External Prometheus |

Compose files:

- `docker-compose.yml` — dev, Postgres only (unchanged from before).
- `docker-compose.staging.yml` — app + Postgres, both containers.
- `docker-compose.prod.yml` — app only; no Postgres, Traefik, or Prometheus container (all external).

## GHCR image

`.github/workflows/docker-publish.yml` builds the root `Dockerfile` and pushes to `ghcr.io/jsilvanus/crowd-source-voice` on every push to `main` and on `vX.Y.Z` tags:

- `sha-<short-sha>` — every build, immutable. Use this to pin staging to an exact commit.
- `edge` — floating pointer to the latest `main` build. For ad-hoc testing only — never pin staging/prod to it.
- `X.Y.Z` and `latest` — only published from a pushed `vX.Y.Z` tag. Prod pins to the explicit `X.Y.Z` tag, **never** `latest`, so a rollback is just changing `IMAGE_TAG` back.

GHCR packages are private by default. Run `docker login ghcr.io` (a PAT with `read:packages` works) once on each staging/prod host before the first `docker compose ... up`.

Bumping the deployed version is a deliberate edit to `IMAGE_TAG` in `.env.staging`/`.env.prod`, not something that happens automatically on every `main` push — that keeps a staging/prod deploy an explicit action.

## Running staging or prod

Both compose files need `--env-file`, not just the `env_file:` block inside them — Compose only reads `env_file:` for the container's runtime environment; the `${IMAGE_TAG}`, `${APP_DOMAIN}`, etc. placeholders in the compose YAML itself are resolved separately, from the shell environment or `--env-file`.

```bash
docker login ghcr.io

# Staging
cp .env.staging.example .env.staging   # fill in real values + IMAGE_TAG
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
docker compose --env-file .env.staging -f docker-compose.staging.yml exec app npm run db:migrate
docker compose --env-file .env.staging -f docker-compose.staging.yml exec app npm run db:seed   # first run only

# Prod
cp .env.prod.example .env.prod         # fill in real values + IMAGE_TAG
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
docker compose --env-file .env.prod -f docker-compose.prod.yml exec app npm run db:migrate
```

`.env.staging` and `.env.prod` are gitignored — never commit real credentials. `.env.staging.example`/`.env.prod.example` document every variable.

### Prod + Traefik

`docker-compose.prod.yml` expects an **external** Docker network named `traefik-public` that your externally-run Traefik instance already watches (`docker network create traefik-public` once, if it doesn't exist yet). The app container carries the routing labels; Traefik auto-discovers it — nothing else to configure in this repo. Adjust `TRAEFIK_CERTRESOLVER` if your Traefik uses a different resolver name than `letsencrypt`.

## S3 storage

`STORAGE_DRIVER=local` (dev default) writes to `uploads/` on disk, unchanged from before. `STORAGE_DRIVER=s3` streams uploads straight to a bucket via `server/utils/storage.js` — no code changes needed between AWS S3 and an S3-compatible store like MinIO:

- **AWS S3**: set `S3_BUCKET` + `S3_REGION`. Leave `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE` unset. Leave `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` unset too if the host has an IAM role — otherwise set both.
- **MinIO / other S3-compatible**: also set `S3_ENDPOINT` (e.g. `http://minio:9000`) and `S3_FORCE_PATH_STYLE=true`.

Dev can point at S3 too (e.g. a local MinIO container) by setting the same vars in `.env` — nothing staging/prod-specific about the driver itself.

## Prometheus metrics

`GET /metrics` (unauthenticated — scrapers don't carry a JWT) returns the default `prom-client` process metrics plus `http_request_duration_seconds`. This endpoint is **not** exposed through the prod Traefik router (no label routes to it) — point your external Prometheus at the container directly over the internal Docker network, or a separate internal-only entrypoint, rather than publishing it publicly.

## Logging

Structured JSON logs (pino) go to stdout in staging/prod (pretty-printed in dev). Logs never include PII — only IDs (`userId`, not email), UUID storage keys, HTTP method/route/status, and error messages/stacks; see `server/utils/logger.js` for the redaction config. Point your log collector (staging/prod) at container stdout as usual.
