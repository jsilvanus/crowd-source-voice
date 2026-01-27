export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/server'],
  testMatch: ['**/__tests__/**/*.js', '**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/db/migrate.js',
    '!server/db/seed.js',
    '!server/index.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  transform: {}
};
