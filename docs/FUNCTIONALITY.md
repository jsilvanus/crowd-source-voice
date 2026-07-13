# Functionality Reference

A complete, plain-language description of everything the app does today. Written as the source of truth for the frontend redesign: every screen, flow, state, and rule listed here is implemented and verified against the backend (branch `claude/backend-review-docs-8anptk`). API endpoints are noted per feature so redesigned components can be wired up without reading server code.

**The idea in one paragraph:** Admins create *corpora* (collections of text sentences or ABC music notation) and upload source files that are automatically split into short *prompts*. Users read/sing prompts aloud and record them in the browser (16 kHz mono WAV). Other users then *validate* recordings by listening and scoring them 1–5. Recordings with **at least 2 validations and an average score ≥ 4.0** become part of the exportable dataset, which admins download as Whisper-compatible CSV or JSON.

---

## 1. Roles and access

| Role | Can do |
|---|---|
| Visitor (not logged in) | Register, log in, read Privacy Policy and Terms of Service |
| User | Everything below under "User features" |
| Admin | Everything a user can, plus the Admin section |

- Every page except Login, Register, Privacy, and Terms requires login; unauthenticated visitors are redirected to `/login`.
- Admin pages redirect non-admins to the dashboard.
- Auth is a JWT (7-day expiry) stored in localStorage and sent as a `Bearer` header on every API call. There is no refresh token: when it expires the user must log in again.

## 2. Route map (current)

| Path | Page | Access |
|---|---|---|
| `/login` | Login | public |
| `/register` | Register | public |
| `/privacy` | Privacy Policy | public |
| `/terms` | Terms of Service | public |
| `/` | Dashboard (corpus picker + personal stats) | user |
| `/record/:corpusId` | Recording studio | user |
| `/validate` | Validation queue | user |
| `/my-recordings` | Own recordings list | user |
| `/profile` | Account, GDPR actions | user |
| `/admin/dashboard` | Platform stats | admin |
| `/admin/corpora` | Corpus management | admin |
| `/admin/users` | User management | admin |
| `/admin/export` | Dataset export + flagged review | admin |
| anything else | redirect to `/` | — |

Global chrome on every page: **Header** (logo, nav links that vary by auth/role, language selector EN/FI/SV, theme toggle, logout) and a one-time **storage notice banner** (see §10).

---

## 3. Sign-up and login

**Register** (`POST /api/auth/register`)
- Fields: email, password (min 6 chars), and a required "I accept the Terms of Service and Privacy Policy" checkbox.
- Server records the acceptance timestamp. Duplicate email → error "Email already registered".
- Success logs the user straight in (token returned).

**Login** (`POST /api/auth/login`) — email + password; wrong credentials give a generic "Invalid credentials".

**Logout** (`POST /api/auth/logout`) — clears the local token; the server call is informational only.

**Session restore** — on app load, `GET /api/auth/me` re-validates the stored token and returns the user (id, email, role, termsAcceptedAt, recordingConsentAt). The app shows a full-screen spinner until this resolves.

---

## 4. Dashboard (`/`)

- Three personal stat tiles from `GET /api/me/stats`: **Your Recordings**, **Validations Made**, **Corpora Contributed**.
- Grid of corpus cards from `GET /api/corpus`: name, type badge (text/music), language badge, description, and per-corpus counts (prompts / recordings / validated). Each card's button goes to `/record/:corpusId`.
- Empty state when no corpora exist.
- A "Help Validate Recordings" card linking to `/validate`.

---

## 5. Recording studio (`/record/:corpusId`)

The most complex user screen. Loads the corpus (`GET /api/corpus/:id`) and the next prompt (`GET /api/prompt?corpus_id=`) in parallel.

### 5.1 Recording-consent gate

If the user has never given **recording consent** (separate from ToS acceptance), the studio is replaced by a consent card: bullet list of what recording means (public research datasets, anonymized IDs, deletion rights, irrevocability once released) with links to Privacy/Terms, and buttons **Go Back** / **I Agree – Start Recording** (`POST /api/me/consent/recording`). Consent is stored server-side with a timestamp and can be withdrawn (`DELETE /api/me/consent/recording`, currently only exposed via API).

### 5.2 Prompt selection logic (server-side)

The server picks a prompt the user hasn't recorded yet, preferring the least-skipped, then least-recorded ones, random among ties. When none remain, the page shows an "All done!" card. One recording per user per prompt (enforced server-side; a duplicate attempt returns 400).

### 5.3 Recording flow and states

State machine of the main card:

1. **Idle** — prompt text shown large (monospace styling for music notation), placeholder waveform box, red **REC** button, and a **Skip this prompt** link (`POST /api/prompt/:id/skip`; skips are counted so problem prompts sink in the queue and surface for admin review).
2. **Recording** — live scrolling waveform (canvas, from mic analyser data), elapsed timer, **STOP** button. Recording **auto-stops at 30 s**; the timer shows a "(max 30s)" warning during the last 5 seconds. Microphone-permission failure shows an error and returns to idle.
3. **Review** — static waveform of the take, native audio player for listening back, analysis results, and buttons **Re-record** (discard) / **Submit Recording**.

### 5.4 Client-side quality analysis

Audio is captured at 16 kHz mono and encoded to WAV in the browser. After stopping, the take is analyzed and the results shown as stats (duration, silence %, peak level) plus any issues:

- **Blocking** (submit disabled): shorter than 0.5 s, longer than 30 s, more than 70 % silence.
- **Warnings** (submit allowed): quiet peak level, clipping.

### 5.5 Submission

`POST /api/recording` as multipart (`audio` file, `prompt_id`, `duration`) through an XHR uploader that reports progress to a progress bar. Uploads over 20 MB, wrong file types, or a full disk (HTTP 507 when the server has < 200 MB free) are rejected with readable errors. On success: success message, then the next prompt loads automatically after ~1.5 s.

A static "Recording Requirements" card (duration limits, silence limit, speak clearly, quiet environment; music corpora add "sing or hum naturally") sits below the studio.

---

## 6. Validation (`/validate`)

- Three stat tiles from `GET /api/validation/stats`: total recordings, fully validated (≥ 2 validations), accepted (avg ≥ 4.0).
- `GET /api/validation` serves one recording at a time: never the user's own, never one they already scored, preferring recordings with the fewest validations. Optional `?corpus_id=` filter exists in the API (UI doesn't use it yet). Anonymized recordings (from deleted accounts) remain in the queue.
- The card shows corpus + language badges, the prompt text, an audio player (`/uploads/...` file), and duration.
- Scoring: five buttons 1–5 with a Poor→Excellent axis; **Submit Score** (`POST /api/validation`, enabled once a score is picked) or **Skip** (just fetches another; nothing is stored). After submit, the next recording loads after ~1 s.
- Scoring guidelines card: 5 = clear/natural/matches text … 1 = wrong text/noise/incomplete.
- Empty state "All done!" when nothing is left to validate.

Each submitted score immediately recomputes the recording's average quality score server-side. A user can score a given recording only once (enforced by the server).

---

## 7. My Recordings (`/my-recordings`)

- Table of own recordings from `GET /api/me/recordings`: corpus badge, truncated prompt text, duration, **validation count** (green badge at ≥ 2, amber below), date, inline audio player, and a **Delete** button (confirm dialog → `DELETE /api/recording/:id`, removes the row, the DB record, and the audio file).
- Deliberate design rule: **individual quality scores are never shown to the owner** (only the validation count), to prevent gaming; an info card explains this and the ≥ 4.0 / ≥ 2 validations acceptance rule.
- Empty state links back to the dashboard.

---

## 8. Profile (`/profile`)

- **Account information**: email, role badge, terms-accepted date, recording-consent date (or "Not yet given").
- **Privacy & data**: links to Privacy/Terms; **Export My Data** downloads a JSON of everything the platform holds on the user — profile, all recordings (prompt, corpus, duration, quality score, date), all validations given, and summary counts (`GET /api/me/export`).
- **Your contributions**: same three stats as the dashboard.
- **Danger zone → Delete Account** opens a modal with two radio options:
  - **Delete everything** (`DELETE /api/me`) — account, recordings (files included), and validations are permanently removed.
  - **Anonymize recordings** (`POST /api/me/anonymize`) — account and validations are deleted, but recordings stay in the dataset with no link to the person.
  - Confirm executes, logs out, and redirects to login.

---

## 9. Legal pages

`/privacy` and `/terms` are static, translated pages (placeholder legal text) reachable without login, from the register form, the consent gate, the storage banner, and the profile.

---

## 10. Storage notice, i18n, theming

- **Storage banner**: first visit shows a fixed bottom banner explaining localStorage use (auth token, language, theme, this acknowledgment). Single "I understand" button; acknowledgment is stored locally and it never reappears. Informational only — no accept/reject choice.
- **Languages**: English, Finnish, Swedish. Selector in the header; choice persists in localStorage. All UI strings go through the translation function; adding a language = one new file in `client/src/i18n/` + registering it in the languages list. (Some pages still have hard-coded English strings — worth unifying during the redesign.)
- **Theme**: light/dark toggle in the header, persisted in localStorage, defaults to the OS preference. Colors are CSS custom properties in `client/src/index.css`.

---

## 11. Admin features

### 11.1 Admin dashboard (`/admin/dashboard`)

`GET /api/admin/stats` in one call:
- Totals: users, recordings, validations, corpora.
- **Storage bar**: used/free with percentage; turns red plus warning alert when free space is low (uploads block below 200 MB).
- **Corpus progress table**: per corpus — prompts, recorded, validated, and a completion bar (recordings ÷ prompts).
- **Recent activity**: last 10 recordings (user email or "Anonymous", corpus, duration, timestamp).

### 11.2 Corpora management (`/admin/corpora`)

- Table of all corpora with type/language, prompt/recording/validated counts, created date.
- **Create Corpus** modal: name, language (free text), type (`text` = spoken words / `music` = ABC notation), optional description → `POST /api/corpus`.
- **Upload** modal per corpus: accepts `.txt` `.json` `.csv` `.abc` (max 50 MB), uploads with a progress bar (`POST /api/corpus/:id/upload`), then the server splits it into prompts and reports how many were created. The original source is stored in the DB.
  - Text splitting: by sentence, chunked at ~15 words (splitting at commas where possible), sentences under 2 words dropped, duplicates removed.
  - Music splitting: by ABC `X:` tune headers (duplicate tunes deduped regardless of tune number); plain-line melody files get one prompt per line.
  - JSON accepted as an array of strings, array of `{text|content|prompt}` objects, or an object with an `items`/`prompts`/`data` array. CSV = one text per line, header row auto-skipped.
- **Source** button downloads the stored original file (`GET /api/corpus/:id/source`).
- **Delete** (confirm dialog) removes the corpus **and all its prompts, recordings, and audio files** (`DELETE /api/corpus/:id`).
- API-only (no UI yet): `POST /api/corpus/:id/reprocess` re-splits prompts from the stored source (⚠ replaces existing prompts and therefore their recordings), and `GET /api/corpus/:id/skipped?threshold=` lists prompts skipped ≥ N times (default 3) for review.

### 11.3 User management (`/admin/users`)

- Table from `GET /api/admin/users`: email, role, recordings count, validations count, joined date, consent status.
- **Role change** user ⇄ admin (`PUT /api/admin/users/:id/role`); admins cannot demote themselves.
- **Delete user** (confirm dialog, `DELETE /api/admin/users/:id`): removes the account, their validations, recordings, and audio files; admins cannot delete themselves here (they're pointed to Profile).

### 11.4 Dataset export (`/admin/export`)

- **Export statistics table** (`GET /api/export/stats`): per corpus — total recordings, exportable count (green badge), total exportable audio duration (h/m), and three actions:
  - **CSV** — validated recordings only, Whisper-compatible: `file,text,duration,quality_score` (music corpora use `notation` instead of `text`). Files are numbered `0001.wav`, `0002.wav`, …
  - **JSON** — same data plus corpus metadata and per-recording validation counts.
  - **All** — CSV including non-validated recordings (`include_all=true`).
  - Buttons disable when there is nothing to export. Downloads happen client-side as file saves.
- **Format examples** card showing the CSV and JSON shapes.
- **Flagged recordings** (`GET /api/validation/flagged`): collapsible table of recordings needing review — average score below 4.0 **or** score spread (max − min) ≥ 2. Shows corpus, prompt, avg score badge, validation count, variance, and an inline player. Currently read-only (first 20 shown); there is no delete/override action yet.
- **Quality requirements** card restating the export rules.
- API-only: `GET /api/export/manifest?corpus_id=` maps export filenames (`0001.wav`) to actual stored file paths, for scripting the audio-file copy step.

---

## 12. Core business rules (quick reference)

| Rule | Value |
|---|---|
| Recording length | 0.5 – 30 s (auto-stop at 30) |
| Max silence | 70 % |
| Audio format | WAV, 16 kHz, mono (browser-encoded) |
| Recording upload limit | 20 MB |
| Corpus file limit | 50 MB (`.txt` `.json` `.csv` `.abc`) |
| One recording | per user per prompt |
| One validation | per user per recording; never your own |
| Validation scale | 1–5 |
| Exportable ("validated") | ≥ 2 validations **and** avg score ≥ 4.0 |
| Flagged for review | avg < 4.0 or score spread ≥ 2 |
| Upload block | server free disk < 200 MB (HTTP 507) |
| Prompt text chunks | ~15 words max, ≥ 2 words |
| Session | JWT, 7 days, localStorage |

## 13. Known gaps / notes for the redesign

- **Score privacy**: `GET /api/me/recordings` returns `quality_score`, but the UI intentionally hides it — keep hiding it.
- **Unused API capabilities** the redesign could surface: corpus filter on the validation queue, corpus reprocess, skipped-prompts review, consent withdrawal, export manifest, single-user admin detail view (`GET /api/admin/users/:id`), prompt stats (`GET /api/prompt/stats/:corpus_id`).
- **i18n coverage** is partial — several pages (Record, Validate, Profile, MyRecordings, parts of admin) have hard-coded English strings while Header/CookieConsent/AdminDashboard are translated.
- The Validate page's **Skip** is client-side only (nothing recorded), unlike prompt skipping which is counted server-side.
- Admin **Export page downloads CSV via fetch + Blob**, so the server's sanitized `Content-Disposition` filename is ignored and the client names files `corpus-<id>-dataset.csv`.
- Legal texts are placeholders.
