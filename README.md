# Voice Crowdsourcing Platform

A web application for crowdsourcing audio recordings for speech-to-text (STT) and audio model training. Supports multiple corpora (text and music notation), crowd-validated quality control, and dataset export.

## Features

### Core Features
- **Multi-corpus support**: Manage multiple text and music corpora with language tagging
- **Audio recording**: Web-based recording with real-time waveform visualization
- **Crowd validation**: Users score recordings (1-5 scale) for quality control
- **Quality metrics**: Automatic quality scoring based on crowd validations
- **Dataset export**: Export validated recordings in CSV/JSON format (Whisper-compatible)
- **GDPR compliant**: Full data export, account deletion, and anonymization options

### Audio Processing
- **Real-time waveform**: Live visualization during recording using Canvas API
- **Audio analysis**: Automatic detection of silence ratio, peak amplitude, and duration
- **Quality gates**: Recordings must meet duration (0.5s-30s) and silence (<70%) requirements
- **Format**: 16kHz mono WAV for optimal STT compatibility

### Admin Features
- **Admin dashboard**: Platform statistics including users, recordings, validations, and disk usage
- **User management**: View users, change roles (user/admin), delete accounts
- **Corpus management**: Create corpora, upload source files, reprocess prompts
- **Flagged recordings**: Review low-quality or high-variance recordings
- **Export tools**: Export datasets with quality filtering and statistics

### Localization & Compliance
- **Internationalization (i18n)**: Full support for English, Finnish, and Swedish
- **Cookie consent**: Informational banner explaining local storage usage
- **Recording consent**: Explicit consent gate before users can record
- **Privacy & Terms**: Built-in Privacy Policy and Terms of Service pages
- **Dark mode**: User-selectable light/dark theme with system preference detection

### Infrastructure
- **Disk space monitoring**: Automatic upload blocking when storage is low (<200MB)
- **Progress indicators**: Upload progress bars and corpus processing status

## Tech Stack

- **Backend**: Node.js (ESM), Express
- **Frontend**: React, Vite
- **Database**: PostgreSQL
- **Audio**: Web Audio API, WAV/WebM format

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd crowd-source-voice
```

2. Install dependencies:
```bash
npm install
cd client && npm install && cd ..
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. Create the database (here, with a docker example):
```bash
docker compose up -d
```
The bundled `docker-compose.yml` exposes PostgreSQL on host port **7005** with user `crowdsourcer` and database `crowd_source_voice_db`; the defaults in `.env.example` match it. If you run your own PostgreSQL, adjust `DATABASE_URL` accordingly.

For staging/prod (dockerized app, S3 file storage, Traefik/Prometheus integration), see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

5. Run migrations:
```bash
npm run db:migrate
```

6. (Optional) Seed with sample data:
```bash
npm run db:seed
```

7. Start development servers:
```bash
npm run dev
```

The app will be available at http://localhost:5173

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Corpus Management
- `GET /api/corpus` - List corpora with stats
- `GET /api/corpus/:id` - Get corpus details
- `POST /api/corpus` - Create corpus (admin)
- `POST /api/corpus/:id/upload` - Upload corpus file (admin)
- `POST /api/corpus/:id/reprocess` - Re-split prompts from stored source (admin; replaces existing prompts and their recordings)
- `GET /api/corpus/:id/source` - Get stored source content (admin)
- `GET /api/corpus/:id/skipped?threshold=` - List frequently skipped prompts (admin)
- `DELETE /api/corpus/:id` - Delete corpus and its audio files (admin)

### Prompts & Recording
- `GET /api/prompt?corpus_id=` - Get next prompt
- `GET /api/prompt/:id` - Get a specific prompt
- `GET /api/prompt/stats/:corpus_id` - Prompt statistics for a corpus
- `POST /api/prompt/:id/skip` - Skip a prompt
- `POST /api/recording` - Upload recording
- `GET /api/recording/:id` - Get a recording
- `DELETE /api/recording/:id` - Delete own recording

### Validation
- `GET /api/validation?corpus_id=` - Get recording to validate (corpus filter optional)
- `POST /api/validation` - Submit validation score
- `GET /api/validation/stats` - Get validation statistics
- `GET /api/validation/flagged` - Flagged recordings for review (admin)

### User Data & GDPR
- `GET /api/me/recordings` - Get own recordings
- `GET /api/me/stats` - Get user statistics
- `GET /api/me/export` - Export all personal data (GDPR)
- `DELETE /api/me` - Delete account and all data
- `POST /api/me/anonymize` - Delete account, keep anonymous recordings
- `POST /api/me/consent/recording` - Give recording consent
- `DELETE /api/me/consent/recording` - Withdraw recording consent

### Admin
- `GET /api/admin/stats` - Platform statistics (users, recordings, disk space)
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:id` - Get single user details
- `PUT /api/admin/users/:id/role` - Update user role (`{"role": "user"|"admin"}`)
- `DELETE /api/admin/users/:id` - Delete user account and their data

### Export (Admin)
- `GET /api/export?corpus_id=&format=csv|json&include_all=` - Export dataset. `format=json` rows include a
  `speaker_id` field — a salted, one-way hash of the contributor's email (never the email itself, see
  `server/utils/speakerId.js`), for speaker-disjoint dataset splitting downstream. `null` when the
  recording's contributor account was deleted/anonymized. The CSV format is unchanged
  (`file,text,duration,quality_score` / `file,notation,duration,quality_score`) to stay Whisper-compatible
  for existing consumers.
- `GET /api/export/stats?corpus_id=` - Export statistics per corpus
- `GET /api/export/manifest?corpus_id=` - Get file manifest for export (also includes `speaker_id`)
- `GET /api/export/audio/:recordingId` - Download one recording's audio, streamed from whichever storage
  driver is active (local disk or S3)

These four routes accept `Authorization: Bearer <token>` where the token is either an admin JWT (from login)
or, for unattended sync, the long-lived read-only `EXPORT_API_TOKEN` (see
[Export configuration](#export-configuration)). The export token works on these four GET routes only and
grants the validated export only: `include_all=true` (which also returns unvalidated and low-quality
recordings) is answered with `403` when the export token is used and needs an admin JWT.

**JSON export** (`format=json`): each element of `recordings[]` has

| Field | Description |
|-------|-------------|
| `file` | Positional file name (`0001.wav`). Shifts between calls as recordings qualify; do not use it as an identifier. |
| `recording_id` | Stable integer id of the recording. Use this as the identifier. |
| `audio_url` | `/api/export/audio/<recording_id>`: the URL consumers should fetch the audio from (see below). |
| `original_path` | The raw stored value: a storage key such as `audio/<uuid>.wav`, or a legacy `/uploads/...` path. Informational; do not fetch it directly. |
| `speaker_id` | Salted, one-way hash of the contributor's email; stable per contributor. `null` when the contributor account was deleted or anonymized. |
| `text` / `notation` | Prompt text (`notation` for music corpora). |
| `duration`, `quality_score`, `validation_count` | As before. |

**Manifest** (`/api/export/manifest`): each element of `files[]` has `id`, `recording_id` (same value as `id`),
`source_path` (the raw stored value, like `original_path`), `audio_url`, `export_name`, `speaker_id` and `text`.

The CSV export is unchanged and carries none of the new fields. No email address, password hash, consent
timestamp or raw user id is ever included in any export.

**Fetching audio.** Send the same bearer token to `audio_url` (relative to the server's base URL). The server
streams the file with `Content-Type` from its extension (for example `audio/wav`), `Content-Length` when known,
`Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. The same qualification as the export
applies: only recordings with at least 2 validations and a quality score of at least 4.0 are served, and
anything else (unknown id, not yet validated, score too low, or a file missing from storage) gets the same
`404 {"error":"Recording not found"}`, so the response does not reveal which. An admin JWT may add
`?include_all=true` to fetch any recording; the export token may not.

| Request | Status |
|---------|--------|
| Validated recording, export token or admin JWT | `200` audio bytes |
| Not validated / score too low / no such id / file missing in storage | `404 {"error":"Recording not found"}` |
| `recordingId` is not a positive integer (Postgres integer range) | `400` |
| Export token with `include_all=true` | `403` (before any lookup) |
| Admin JWT with `include_all=true` | `200` for any existing recording, `404` otherwise |
| Non-admin JWT | `403` |
| No, wrong or malformed credentials; token not configured | `401` |
| Unexpected storage or database failure | `500 {"error":"Internal server error"}` (no paths or bucket names) |

### Export configuration

Set these in `.env` (see `.env.example`):

- `SPEAKER_ID_SALT` - Salt mixed into the hash that produces `speaker_id`. Use a long random value, for example
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Without it the ids are still
  one-way but can be recovered by hashing known email addresses, so the server logs a warning at startup when
  it is unset. **Do not change it after data has been exported**: speaker ids derive from it, so changing it
  gives every speaker a new id and breaks speaker-level splits in anything built on earlier exports. Keep it
  private.
- `EXPORT_API_TOKEN` - Optional long-lived read-only token for unattended dataset sync (for example a training
  pipeline that cannot log in as an admin every 7 days). Send it as `Authorization: Bearer <token>`. It is
  accepted on the four `GET /api/export...` routes above and grants nothing else (no admin, user or write
  routes). It grants validated recordings only (at least 2 validations and a quality score of at least 4.0);
  `include_all=true` is refused with `403` and needs an admin JWT. Use a long random value. If unset or empty
  the feature is off and only admin JWTs work. Rotating it is safe: change the value and restart the server;
  nothing else depends on it, only the clients that use it need the new value.

### Misc
- `GET /api/health` - Health check (no auth)
- `GET /api/disk-space` - Disk space status (admin)

## Corpus File Formats

### Text Corpora
- `.txt` - Plain text, split by sentences (long sentences are chunked at ~15 words; sentences under 2 words are dropped)
- `.json` - Array of strings, array of objects with a `text`/`content`/`prompt` field, or an object with an `items`/`prompts`/`data` array
- `.csv` - One text per line (a `text`/`prompt`/`content` header row is skipped)

### Music Corpora
- `.abc` - ABC notation, split by tune (X: headers)
- `.txt` - One melody per line

## Quality Control

### Recording Requirements
Before submission, recordings are analyzed for:
- **Duration**: Must be between 0.5 and 30 seconds
- **Silence ratio**: Must be less than 70% silence
- **Audio level**: Peak amplitude is measured for quality feedback

### Validation Thresholds
Recordings are accepted for export when:
- At least 2 validations from different users
- Average score >= 4.0 (on 1-5 scale)

Flagged recordings (low scores or high variance) appear in admin review.

## Internationalization (i18n)

The application supports multiple languages:
- **English (EN)** - Default
- **Finnish (FI)**
- **Swedish (SV)**

Users can switch languages via the header dropdown. The selected language is persisted in localStorage.

To add a new language:
1. Create a new translation file in `client/src/i18n/` (e.g., `de.js`)
2. Export the translations object with all required keys
3. Add the language to the `languages` array in `client/src/i18n/index.js`

## Theming

The application supports light and dark modes:
- Users can toggle between themes via the header
- Theme preference is saved to localStorage
- System preference is detected on first visit

Theme variables are defined in `client/src/index.css` using CSS custom properties.

## Deployment

### DigitalOcean

1. Create a droplet (Ubuntu 22.04)
2. Install Node.js and PostgreSQL
3. Clone repository and install dependencies
4. Set up Nginx as reverse proxy
5. Configure SSL with Let's Encrypt
6. Use PM2 for process management

Example Nginx config:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## License

MIT
