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
- **Quality gates**: Recordings must meet duration (0.5s-120s) and silence (<80%) requirements
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

### Corpus Management (Admin)
- `POST /api/corpus` - Create corpus
- `POST /api/corpus/:id/upload` - Upload corpus file
- `GET /api/corpus` - List corpora with stats
- `GET /api/corpus/:id` - Get corpus details
- `DELETE /api/corpus/:id` - Delete corpus

### Recording
- `GET /api/prompt?corpus_id=` - Get next prompt
- `POST /api/prompt/:id/skip` - Skip a prompt
- `POST /api/recording` - Upload recording

### Validation
- `GET /api/validation` - Get recording to validate
- `POST /api/validation` - Submit validation score
- `GET /api/validation/stats` - Get validation statistics

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
- `PUT /api/admin/users/:id` - Update user role
- `DELETE /api/admin/users/:id` - Delete user account

### Export (Admin)
- `GET /api/export?corpus_id=&format=csv|json` - Export dataset
- `GET /api/export/stats` - Export statistics per corpus
- `GET /api/export/manifest?corpus_id=` - Get file manifest for export

## Corpus File Formats

### Text Corpora
- `.txt` - Plain text, split by sentences
- `.json` - Array of strings or objects with `text` field
- `.csv` - One text per line

### Music Corpora
- `.abc` - ABC notation, split by tune (X: headers)
- `.txt` - One melody per line

## Quality Control

### Recording Requirements
Before submission, recordings are analyzed for:
- **Duration**: Must be between 0.5 and 120 seconds
- **Silence ratio**: Must be less than 80% silence
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
