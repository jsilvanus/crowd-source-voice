import pool from './index.js';

const migrations = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  consent_given BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Corpora table
CREATE TABLE IF NOT EXISTS corpora (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  language VARCHAR(50) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('text', 'music')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prompts table
CREATE TABLE IF NOT EXISTS prompts (
  id SERIAL PRIMARY KEY,
  corpus_id INTEGER REFERENCES corpora(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('text', 'music')),
  text TEXT NOT NULL,
  skipped_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recordings table
CREATE TABLE IF NOT EXISTS recordings (
  id SERIAL PRIMARY KEY,
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  file_path VARCHAR(500) NOT NULL,
  duration FLOAT,
  quality_score FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Validations table
CREATE TABLE IF NOT EXISTS validations (
  id SERIAL PRIMARY KEY,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
  validator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(recording_id, validator_id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_prompts_corpus_id ON prompts(corpus_id);
CREATE INDEX IF NOT EXISTS idx_recordings_prompt_id ON recordings(prompt_id);
CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_validations_recording_id ON validations(recording_id);
CREATE INDEX IF NOT EXISTS idx_validations_validator_id ON validations(validator_id);
CREATE INDEX IF NOT EXISTS idx_prompts_skipped_count ON prompts(skipped_count);
`;

async function migrate() {
  try {
    console.log('Running database migrations...');
    await pool.query(migrations);
    console.log('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
