import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Mock user for testing
export const mockUser = {
  id: 1,
  email: 'test@example.com',
  role: 'user',
  password_hash: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.SHLvxAqfqFGOv6' // 'password123'
};

export const mockAdmin = {
  id: 2,
  email: 'admin@example.com',
  role: 'admin',
  password_hash: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.SHLvxAqfqFGOv6'
};

// Generate test token
export function generateTestToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
}

// Mock database query function
export function createMockQuery(responses = {}) {
  return jest.fn().mockImplementation((sql, params) => {
    // Find matching response based on SQL pattern
    for (const [pattern, response] of Object.entries(responses)) {
      if (sql.includes(pattern)) {
        if (typeof response === 'function') {
          return Promise.resolve(response(sql, params));
        }
        return Promise.resolve(response);
      }
    }
    // Default empty response
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

// Mock corpus
export const mockCorpus = {
  id: 1,
  name: 'Test Corpus',
  language: 'English',
  type: 'text',
  description: 'Test description',
  created_at: new Date().toISOString()
};

// Mock prompt
export const mockPrompt = {
  id: 1,
  corpus_id: 1,
  type: 'text',
  text: 'Hello world.',
  skipped_count: 0,
  created_at: new Date().toISOString()
};

// Mock recording
export const mockRecording = {
  id: 1,
  prompt_id: 1,
  user_id: 1,
  file_path: '/uploads/audio/test.wav',
  duration: 2.5,
  quality_score: null,
  created_at: new Date().toISOString()
};
