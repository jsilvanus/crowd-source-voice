# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A voice crowdsourcing platform for collecting and validating audio recordings for STT/audio model training. Node.js (ESM) + Express backend, React (Vite) frontend, PostgreSQL. Users record prompts drawn from admin-managed corpora, cross-validate each other's recordings (1–5 score), and admins export validated datasets (Whisper-compatible CSV/JSON).

## Commands

```bash
npm install && cd client && npm install && cd ..   # install both packages

docker compose up -d          # PostgreSQL on host port 7005 (user crowdsourcer, db crowd_source_voice_db)
cp .env.example .env          # defaults match docker-compose.yml
npm run db:migrate            # create/update schema (idempotent)
npm run db:seed               # admin user (admin@example.com/admin123 unless ADMIN_EMAIL/ADMIN_PASSWORD set) + sample corpus

npm run dev                   # server (nodemon, :3001) + client (vite, :5173) concurrently
npm start                     # production server only (serves client/dist when NODE_ENV=production)
npm run build                 # build client

npm test                      # backend jest tests (uses --experimental-vm-modules for ESM)
npm test -- corpusSplitter    # single backend test file by name pattern
npm run test:client           # client tests (vitest, run from client/)
npm run test:all              # both
```

Backend tests need no database — they mock `db/index.js` via `jest.unstable_mockModule` (see `server/middleware/__tests__/auth.test.js`). Jest only picks up `*.test.js`; shared fixtures live in `server/__tests__/testHelpers.js` (not a test file — keep it out of `testMatch`).

## Architecture

### Backend (`server/`)

- `index.js` — Express app. **`import 'dotenv/config'` must stay the first import**: `middleware/auth.js` reads `JWT_SECRET` at module load. The final error-handler middleware maps Multer errors to 400/413; everything else becomes `err.status || 500`.
- `routes/` — one router per domain, mounted in `index.js`: `auth` (`/api/auth`), `corpus`, `prompt`, `recording`, `validation`, `user` (mounted at `/api/me`), `export`, `admin`. All routes are JWT-authenticated (`Authorization: Bearer`) except register/login/health; admin routes add `requireAdmin`. The exception is the read-only `GET /api/export`, `/manifest`, `/stats` and `/audio/:recordingId`, which also accept `EXPORT_API_TOKEN` (see `middleware/exportAuth.js`).
- `middleware/auth.js` — `authenticate` loads the user from the DB on every request and sets `req.user`; `generateToken(userId)` issues 7-day JWTs.
- `middleware/exportAuth.js` — `authenticateExportRead` accepts `Authorization: Bearer <EXPORT_API_TOKEN>` (constant-time compare, off when the env var is unset) or falls through to `authenticate` + `requireAdmin`. Sets `req.exportTokenAuth = true` only for a valid token so handlers can hold it to the validated export (`include_all=true` is a 403). Apply it only to read-only export GET routes; never to anything that writes or returns non-export data.
- `middleware/diskSpace.js` — `checkDiskSpace` rejects uploads with 507 when free space under `uploads/` drops below 200MB (fails open if the check errors); a no-op when `STORAGE_DRIVER=s3`, since local disk isn't where uploads land in that mode.
- `db/index.js` — pg `Pool`, plain `query()`, and `withTransaction(fn)` which hands the callback a dedicated client inside BEGIN/COMMIT/ROLLBACK. Use it for any multi-statement mutation (account deletion, corpus prompt replacement).
- `utils/corpusSplitter.js` — pure functions that split uploaded corpus files (txt/json/csv/abc) into prompts; well covered by tests, keep it side-effect free.
- `utils/params.js` — `parseId()` for route/query IDs; return 400 on `null` instead of letting Postgres throw on malformed input.
- `utils/speakerId.js` — `computeSpeakerId(email, salt = SPEAKER_ID_SALT)`: salted double SHA-256 hash, used by `routes/export.js` to give `format=json` export/manifest rows a stable, non-reversible per-contributor `speaker_id` for downstream speaker-disjoint dataset splitting, without exposing or storing email in the export. Set `SPEAKER_ID_SALT` in production — `index.js` warns at startup if it's unset.
- `utils/storage.js` — file storage abstraction, driver selected by `STORAGE_DRIVER` (`local` default, or `s3`). Routes never call `fs`/`multer.diskStorage` directly: `createUploadMiddleware({ subdir, maxFileSize, fileFilter })` returns a driver-agnostic multer instance (`req.file.storageKey` is what gets persisted as `recordings.file_path`), `deleteStoredFile`/`readStoredFile` replace `fs.unlink`/`fs.readFile`, and `attachFileUrl(s)` resolves a stored key to a fetchable URL (a relative `/uploads/...` path locally, a short-lived presigned S3 URL otherwise) on any response the client plays back via `<audio src>`. `getFileStream(key)` opens a stored file as a Node Readable (`{ stream, contentLength }`, rejecting with `code` `STORAGE_NOT_FOUND` or `INVALID_STORAGE_KEY`) for the token-gated `GET /api/export/audio/:recordingId`; local keys are confined to the uploads root. Works against AWS S3 or an S3-compatible store (MinIO) via `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE`.
- `utils/logger.js` — shared `pino` logger (JSON in production, pretty in dev). **Never log PII** — only IDs (`userId`, never email), UUID storage keys, HTTP method/route/status, and error messages/stacks; the `redact` config is a safety net, not a substitute for keeping PII out of log calls in the first place.
- `utils/metrics.js` / `middleware/metrics.js` — `prom-client` registry with default process metrics plus an `http_request_duration_seconds` histogram (labeled by method/matched-route/status, not raw URL, to bound cardinality); scraped at `GET /metrics` in `index.js`. That route is intentionally unauthenticated — keep it off any public router and restrict access at the network layer instead.

### Data model (see `server/db/migrate.js`)

`users` → `recordings` (user_id, SET NULL on delete = anonymization) → `validations` (unique per recording+validator). `corpora` → `prompts` → `recordings`, both CASCADE. Consequences to keep in mind:

- Deleting prompts (corpus delete/reprocess) cascades away recordings — routes collect `file_path`s first and call `deleteStoredFile` (`utils/storage.js`) after commit, otherwise files are orphaned in local storage or the S3 bucket.
- Anonymized recordings have `user_id NULL`; SQL comparing `r.user_id` to a user must use `IS DISTINCT FROM`, not `!=`, or those rows silently vanish from results.
- `recordings.quality_score` is denormalized: recomputed as the AVG of validations on every validation insert.
- Corpus source files are stored in `corpora.source_content` (the uploaded file is deleted after processing); `POST /corpus/:id/reprocess` re-splits from there.

Migrations are a single idempotent SQL script (`CREATE TABLE IF NOT EXISTS` + `DO $$` blocks for column changes) — extend that file rather than adding a migration framework.

### Quality gates

Export thresholds are duplicated as constants in `routes/validation.js` and `routes/export.js` (`MIN_VALIDATIONS = 2`, `MIN_SCORE_THRESHOLD = 4.0`) — change both together. Client-side recording gates (0.5–30s duration, <70% silence) live in `client/src/utils/audioRecorder.js`.

### Frontend (`client/`)

React + Vite SPA; the vite dev server proxies `/api` and `/uploads` to :3001 (see `client/vite.config.js`). Key pieces:

- `src/utils/api.js` — singleton fetch wrapper; reads the JWT from localStorage; `api.upload()` uses XHR for progress callbacks. All server calls go through it.
- `src/contexts/` — `AuthContext` (login/register/consent state), `I18nContext` (`t()` translations), `ThemeContext` (light/dark).
- `src/i18n/` — en/fi/sv translation files. Any user-facing string needs keys in all three files; new languages register in `src/i18n/index.js`.
- `src/pages/admin/` — admin dashboard pages (users, corpora, export).

### API surface

The full endpoint list is documented in README.md ("API Endpoints") and matches the routes exactly — update both when adding/renaming endpoints, plus the client callers in `src/pages`/`src/contexts`.

### Uploads

`uploads/audio/` (recordings, ≤20MB, wav/webm/ogg) and `uploads/corpora/` (corpus files, ≤50MB, txt/json/csv/abc) via `utils/storage.js`'s Multer wrapper; both directories are gitignored except `.gitkeep`. With the default `STORAGE_DRIVER=local`, files get UUID filenames and are served statically at `/uploads`. With `STORAGE_DRIVER=s3`, uploads stream straight to the configured bucket and are never written to `uploads/` at all — see `docs/DEPLOYMENT.md`.

### Deployment

Three environments: dev (`docker-compose.yml`, Postgres only, app via `npm run dev`), staging (`docker-compose.staging.yml`, app + Postgres both containerized, image pulled from GHCR), prod (`docker-compose.prod.yml`, app only — Postgres/Traefik/Prometheus are external, app joins Traefik's network via labels). `.github/workflows/docker-publish.yml` builds `Dockerfile` and pushes to `ghcr.io/jsilvanus/crowd-source-voice` on pushes to `main`/`vX.Y.Z` tags. Full details, tag strategy, and env vars: `docs/DEPLOYMENT.md`.
