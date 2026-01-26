# Voice Crowdsourcing Platform

A web application for crowdsourcing audio recordings for speech-to-text (STT) and audio model training. Supports multiple corpora (text and music notation), crowd-validated quality control, and dataset export.

## Features

- **Multi-corpus support**: Manage multiple text and music corpora
- **Audio recording**: Web-based recording with playback
- **Crowd validation**: Users score recordings for quality control
- **Quality metrics**: Automatic quality scoring based on validations
- **Dataset export**: Export validated recordings in CSV/JSON format
- **GDPR compliant**: Users can delete or anonymize their data

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

4. Create the database:
```bash
createdb crowd_source_voice
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

### User Data
- `GET /api/me/recordings` - Get own recordings
- `GET /api/me/stats` - Get user statistics
- `DELETE /api/me` - Delete account and data
- `POST /api/me/anonymize` - Delete account, keep anonymous recordings

### Export (Admin)
- `GET /api/export?corpus_id=&format=csv|json` - Export dataset

## Corpus File Formats

### Text Corpora
- `.txt` - Plain text, split by sentences
- `.json` - Array of strings or objects with `text` field
- `.csv` - One text per line

### Music Corpora
- `.abc` - ABC notation, split by tune (X: headers)
- `.txt` - One melody per line

## Quality Control

Recordings are accepted for export when:
- At least 2 validations from different users
- Average score >= 4.0 (on 1-5 scale)

Flagged recordings (low scores or high variance) appear in admin review.

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
