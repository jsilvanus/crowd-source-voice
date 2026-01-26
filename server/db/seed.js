import bcrypt from 'bcryptjs';
import pool from './index.js';

async function seed() {
  try {
    console.log('Seeding database...');

    // Create admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    // Check if admin exists
    const existingAdmin = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );

    if (existingAdmin.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (email, password_hash, role, consent_given)
         VALUES ($1, $2, 'admin', true)`,
        [adminEmail, passwordHash]
      );
      console.log(`Admin user created: ${adminEmail}`);
    } else {
      console.log('Admin user already exists');
    }

    // Create sample corpus (optional)
    const sampleCorpusResult = await pool.query(
      'SELECT id FROM corpora WHERE name = $1',
      ['Sample Corpus']
    );

    if (sampleCorpusResult.rows.length === 0) {
      const corpusResult = await pool.query(
        `INSERT INTO corpora (name, language, type, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Sample Corpus', 'English', 'text', 'A sample corpus for testing']
      );

      const corpusId = corpusResult.rows[0].id;

      // Add sample prompts
      const samplePrompts = [
        'Hello, world!',
        'The quick brown fox jumps over the lazy dog.',
        'How are you doing today?',
        'This is a sample recording prompt.',
        'Please speak clearly into the microphone.',
        'The weather is beautiful outside.',
        'I love learning new languages.',
        'Technology is changing the world.',
        'Music brings people together.',
        'Thank you for your contribution.'
      ];

      for (const text of samplePrompts) {
        await pool.query(
          'INSERT INTO prompts (corpus_id, type, text) VALUES ($1, $2, $3)',
          [corpusId, 'text', text]
        );
      }

      console.log(`Sample corpus created with ${samplePrompts.length} prompts`);
    } else {
      console.log('Sample corpus already exists');
    }

    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();
